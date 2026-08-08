import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ChequeLeavesService } from "../application/cheque-leaves.service";
import { BankChequeLeafEntity } from "../domain/bank-cheque-leaf.entity";

function makeLeaf(overrides: Partial<BankChequeLeafEntity> = {}): BankChequeLeafEntity {
  return {
    id: "leaf-1",
    bookId: "book-1",
    leafNo: 1,
    status: "UNUSED",
    voucherId: null,
    payee: null,
    amount: null,
    issuedOn: null,
    statusReason: null,
    ...overrides,
  } as BankChequeLeafEntity;
}

describe("ChequeLeavesService", () => {
  let chequeLeafRepository: { findNextUnused: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock; list: jest.Mock };
  let service: ChequeLeavesService;
  const em = {} as EntityManager;

  beforeEach(() => {
    chequeLeafRepository = {
      findNextUnused: jest.fn(async () => makeLeaf({ leafNo: 3 })),
      findByIdOrFail: jest.fn(async () => makeLeaf()),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    service = new ChequeLeavesService(chequeLeafRepository as never);
  });

  describe("issueNext() — BR-BANK-04 sequential-leaf selection", () => {
    it("issues the lowest-numbered UNUSED leaf found by findNextUnused()", async () => {
      const result = await service.issueNext(em, { bookId: "book-1", payee: "Acme Supplies", amount: Money.fromInt(500) }, "issuer-1");
      expect(chequeLeafRepository.findNextUnused).toHaveBeenCalledWith("book-1", em);
      expect(result.status).toBe("ISSUED");
      expect(result.leafNo).toBe(3);
      expect(result.payee).toBe("Acme Supplies");
      expect(result.amount?.equals(Money.fromInt(500))).toBe(true);
      expect(result.issuedOn).not.toBeNull();
    });

    it("throws when no UNUSED leaves remain in the book", async () => {
      chequeLeafRepository.findNextUnused.mockResolvedValue(null);
      await expect(
        service.issueNext(em, { bookId: "book-1", payee: "Acme", amount: Money.fromInt(100) }, "issuer-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        service.issueNext(em, { bookId: "book-1", payee: "Acme", amount: Money.ZERO }, "issuer-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("cancel() — BR-BANK-04's explicit-skip requirement", () => {
    it("requires a non-empty reason", async () => {
      await expect(service.cancel("leaf-1", "", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      await expect(service.cancel("leaf-1", "   ", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("cancels an UNUSED leaf with a reason, recording status_reason", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "UNUSED" }));
      const result = await service.cancel("leaf-1", "keyed in error", "actor-1");
      expect(result.status).toBe("CANCELLED");
      expect(result.statusReason).toBe("keyed in error");
    });

    it("cancels an ISSUED leaf with a reason (never a silent skip)", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "ISSUED" }));
      const result = await service.cancel("leaf-1", "cheque damaged", "actor-1");
      expect(result.status).toBe("CANCELLED");
    });

    it("rejects cancelling an already-CLEARED leaf", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "CLEARED" }));
      await expect(service.cancel("leaf-1", "reason", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("status transitions", () => {
    it("markPresented(): ISSUED -> PRESENTED", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "ISSUED" }));
      const result = await service.markPresented("leaf-1", "actor-1");
      expect(result.status).toBe("PRESENTED");
    });

    it("markCleared(): PRESENTED -> CLEARED", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "PRESENTED" }));
      const result = await service.markCleared("leaf-1", "actor-1");
      expect(result.status).toBe("CLEARED");
    });

    it("markStopped() requires a reason", async () => {
      chequeLeafRepository.findByIdOrFail.mockResolvedValue(makeLeaf({ status: "ISSUED" }));
      await expect(service.markStopped("leaf-1", "", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("flagStale() — 6-month auto-flag (manual-trigger, no scheduler)", () => {
    it("flips ISSUED leaves older than 6 months to STALE, leaves recent ones alone", async () => {
      const now = new Date("2026-07-15T00:00:00Z");
      const oldLeaf = makeLeaf({ id: "old-leaf", status: "ISSUED", issuedOn: "2025-12-01" }); // > 6 months before 2026-07-15
      const recentLeaf = makeLeaf({ id: "recent-leaf", status: "ISSUED", issuedOn: "2026-06-01" }); // < 6 months
      chequeLeafRepository.list.mockResolvedValue([oldLeaf, recentLeaf]);

      const result = await service.flagStale(now);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("old-leaf");
      expect(result[0].status).toBe("STALE");
    });
  });
});
