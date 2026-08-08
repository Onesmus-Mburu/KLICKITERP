import { EntityManager } from "typeorm";
import { SuspenseService } from "../application/suspense.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";

const EM = {} as EntityManager;

function makeSuspenseItem(overrides: Partial<PaySuspenseItemEntity>): PaySuspenseItemEntity {
  return {
    id: "suspense-1",
    source: "C2B",
    amount: Money.fromInt(500),
    externalRef: "QGH1234567",
    raw: {},
    receivedAt: new Date("2026-07-10T09:00:00Z"),
    state: "OPEN",
    resolvedReceiptId: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  } as PaySuspenseItemEntity;
}

describe("SuspenseService", () => {
  let suspenseRepository: { findByIdOrFail: jest.Mock; save: jest.Mock; findOpen: jest.Mock };
  let receiptsService: { captureReceipt: jest.Mock };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let service: SuspenseService;

  beforeEach(() => {
    suspenseRepository = {
      findByIdOrFail: jest.fn(async () => makeSuspenseItem({})),
      save: jest.fn(async (e) => e),
      findOpen: jest.fn(async () => [makeSuspenseItem({})]),
    };
    receiptsService = { captureReceipt: jest.fn(async () => ({ id: "receipt-1", number: "PAY-000001" })) };
    studentRepository = { findByIdOrFail: jest.fn(async () => ({ id: "student-1", firstName: "Jane", lastName: "Doe" })) };

    service = new SuspenseService(suspenseRepository as never, receiptsService as never, studentRepository as never);
  });

  describe("matchToStudent", () => {
    it("rejects matching a non-OPEN item", async () => {
      suspenseRepository.findByIdOrFail.mockResolvedValueOnce(makeSuspenseItem({ state: "MATCHED" }));
      await expect(service.matchToStudent(EM, "suspense-1", "student-1", "matcher-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("delegates to ReceiptsService.captureReceipt() with the suspense item's own received_at as receiptDate", async () => {
      const item = await service.matchToStudent(EM, "suspense-1", "student-1", "matcher-1");

      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
      const [em, input] = receiptsService.captureReceipt.mock.calls[0];
      expect(em).toBe(EM);
      expect(input.studentId).toBe("student-1");
      expect(input.receiptDate).toBe("2026-07-10");
      expect(input.total.equals(Money.fromInt(500))).toBe(true);
      expect(input.cashierId).toBe("matcher-1");
      expect(input.idempotencyKey).toBe("suspense-match-suspense-1");
      expect(input.splits).toEqual([expect.objectContaining({ method: "MPESA_C2B", amount: Money.fromInt(500), externalRef: "QGH1234567" })]);

      expect(item.state).toBe("MATCHED");
      expect(item.resolvedReceiptId).toBe("receipt-1");
      expect(item.resolvedBy).toBe("matcher-1");
      expect(item.resolutionNote).toContain("receipt PAY-000001");
    });

    it("maps a BANK/OTHER-source item onto a BANK_TRANSFER split", async () => {
      suspenseRepository.findByIdOrFail.mockResolvedValueOnce(makeSuspenseItem({ source: "BANK", externalRef: "STMT-REF-1" }));

      await service.matchToStudent(EM, "suspense-1", "student-1", "matcher-1");

      const input = receiptsService.captureReceipt.mock.calls[0][1];
      expect(input.splits).toEqual([
        expect.objectContaining({ method: "BANK_TRANSFER", bankAccountId: "STMT-REF-1", externalRef: "STMT-REF-1" }),
      ]);
    });
  });

  describe("refundSuspenseItem", () => {
    it("rejects refunding a non-OPEN item", async () => {
      suspenseRepository.findByIdOrFail.mockResolvedValueOnce(makeSuspenseItem({ state: "REFUNDED" }));
      await expect(service.refundSuspenseItem(EM, "suspense-1", "approval-1", "resolver-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects with no approvalRef (BR-PAY-07 — approval-gated only)", async () => {
      await expect(service.refundSuspenseItem(EM, "suspense-1", "", "resolver-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("records an approval-gated refund without capturing a receipt or calling a payout adapter", async () => {
      const item = await service.refundSuspenseItem(EM, "suspense-1", "approval-1", "resolver-1");

      expect(item.state).toBe("REFUNDED");
      expect(item.resolvedBy).toBe("resolver-1");
      expect(item.resolutionNote).toContain("approval-1");
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
    });
  });

  describe("read-only delegation", () => {
    it("listOpen() delegates to the repository", async () => {
      const items = await service.listOpen();
      expect(items).toHaveLength(1);
      expect(suspenseRepository.findOpen).toHaveBeenCalledTimes(1);
    });

    it("findByIdOrFail() delegates to the repository", async () => {
      await service.findByIdOrFail("suspense-1");
      expect(suspenseRepository.findByIdOrFail).toHaveBeenCalledWith("suspense-1");
    });

    /**
     * Phase 6 Slice 6 — the new `GET /payments/suspense/:id` endpoint
     * (`SuspenseController.findOne()`) is a thin `findByIdOrFail() + toView()`
     * wrapper, mirroring `ChequesController.findOne()` exactly; no controller
     * unit tests exist anywhere in this codebase (confirmed by grep before
     * writing this), so — following this file's own established convention —
     * the real behavior the new endpoint depends on and surfaces as a 404 is
     * covered here, at the service layer: an unknown id must propagate a real
     * `NotFoundException`, not resolve to `null`/undefined or swallow the
     * error.
     */
    it("findByIdOrFail() propagates a NotFoundException for an unknown id — the real error the new GET /payments/suspense/:id endpoint surfaces as a 404", async () => {
      suspenseRepository.findByIdOrFail.mockRejectedValueOnce(new NotFoundException("PaySuspenseItem", "unknown-id"));
      await expect(service.findByIdOrFail("unknown-id")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
