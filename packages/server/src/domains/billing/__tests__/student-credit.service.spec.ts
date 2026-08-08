import { EntityManager } from "typeorm";
import { StudentCreditService } from "../application/student-credit.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillStudentCreditEntity } from "../domain/bill-student-credit.entity";
import { BillStudentCreditEntryEntity } from "../domain/bill-student-credit-entry.entity";

const EM = {} as EntityManager;

function makeCredit(overrides: Partial<BillStudentCreditEntity>): BillStudentCreditEntity {
  return {
    id: "credit-1",
    studentId: "student-1",
    balance: Money.ZERO,
    ...overrides,
  } as BillStudentCreditEntity;
}

function makeEntry(overrides: Partial<BillStudentCreditEntryEntity>): BillStudentCreditEntryEntity {
  return {
    id: "entry-1",
    studentId: "student-1",
    type: "ISSUE",
    amount: Money.fromInt(100),
    balanceAfter: Money.fromInt(100),
    receiptId: null,
    invoiceId: null,
    ...overrides,
  } as BillStudentCreditEntryEntity;
}

describe("StudentCreditService", () => {
  let creditRepository: {
    findByStudentId: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByStudentIdForUpdate: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let entryRepository: { create: jest.Mock; listByStudent: jest.Mock };
  let service: StudentCreditService;

  beforeEach(() => {
    creditRepository = {
      findByStudentId: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeCredit({})),
      findByStudentIdForUpdate: jest.fn(async () => null),
      create: jest.fn(async (data) => makeCredit(data)),
      save: jest.fn(async (e) => e),
    };
    entryRepository = { create: jest.fn(async (data) => makeEntry(data)), listByStudent: jest.fn(async () => []) };
    service = new StudentCreditService(creditRepository as never, entryRepository as never);
  });

  describe("getBalance", () => {
    it("returns Money.ZERO for a student with no row, without creating one", async () => {
      const balance = await service.getBalance("student-1");
      expect(balance.equals(Money.ZERO)).toBe(true);
      expect(creditRepository.create).not.toHaveBeenCalled();
    });

    it("returns the real row balance when one exists", async () => {
      creditRepository.findByStudentId.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(750) }));
      const balance = await service.getBalance("student-1");
      expect(balance.equals(Money.fromInt(750))).toBe(true);
    });
  });

  describe("issue", () => {
    it("creates the row on first use, at balance 0, then increments it by the issued amount", async () => {
      const entry = await service.issue(EM, "student-1", Money.fromInt(1000), { receiptId: "receipt-1", actorId: "cashier-1" });

      expect(creditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: "student-1", balance: Money.ZERO }),
        EM,
      );
      expect(creditRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(1000) }), EM);
      expect(entry.type).toBe("ISSUE");
      expect(entryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-1",
          type: "ISSUE",
          amount: Money.fromInt(1000),
          balanceAfter: Money.fromInt(1000),
          receiptId: "receipt-1",
          invoiceId: null,
        }),
        EM,
      );
    });

    it("increments an EXISTING balance rather than resetting it", async () => {
      creditRepository.findByStudentIdForUpdate.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(500) }));

      await service.issue(EM, "student-1", Money.fromInt(300), { receiptId: "receipt-2", actorId: "cashier-1" });

      expect(creditRepository.create).not.toHaveBeenCalled();
      expect(creditRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(800) }), EM);
      expect(entryRepository.create).toHaveBeenCalledWith(expect.objectContaining({ balanceAfter: Money.fromInt(800) }), EM);
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        service.issue(EM, "student-1", Money.ZERO, { receiptId: "receipt-1", actorId: "cashier-1" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("consume", () => {
    it("decrements the balance and logs a CONSUME entry when sufficient", async () => {
      creditRepository.findByStudentIdForUpdate.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(1000) }));

      const entry = await service.consume(EM, "student-1", Money.fromInt(600), {
        invoiceId: "invoice-1",
        receiptId: "receipt-1",
        actorId: "actor-1",
      });

      expect(creditRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(400) }), EM);
      expect(entry.type).toBe("CONSUME");
      expect(entryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONSUME",
          amount: Money.fromInt(600),
          balanceAfter: Money.fromInt(400),
          invoiceId: "invoice-1",
          receiptId: "receipt-1",
        }),
        EM,
      );
    });

    it("throws (defense-in-depth) when the balance is insufficient — never clamps or goes negative", async () => {
      creditRepository.findByStudentIdForUpdate.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(200) }));

      await expect(
        service.consume(EM, "student-1", Money.fromInt(600), { actorId: "actor-1" }),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(creditRepository.save).not.toHaveBeenCalled();
      expect(entryRepository.create).not.toHaveBeenCalled();
    });

    it("throws when the student has no credit row at all", async () => {
      await expect(
        service.consume(EM, "student-1", Money.fromInt(1), { actorId: "actor-1" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("netOutIssuedCredit — the reversal-safety guard (Phase 6 Slice 12 Part D)", () => {
    it("decrements and logs a CONSUME entry referencing the original receipt when the balance is untouched", async () => {
      creditRepository.findByStudentIdForUpdate.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(1000) }));

      const entry = await service.netOutIssuedCredit(EM, "student-1", Money.fromInt(1000), {
        receiptId: "original-receipt-1",
        actorId: "supervisor-1",
      });

      expect(creditRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.ZERO }), EM);
      expect(entry.type).toBe("CONSUME");
      expect(entryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONSUME",
          amount: Money.fromInt(1000),
          balanceAfter: Money.ZERO,
          receiptId: "original-receipt-1",
          invoiceId: null,
        }),
        EM,
      );
    });

    it("throws the EXACT specified message and mutates nothing when the credit was already partially consumed elsewhere", async () => {
      creditRepository.findByStudentIdForUpdate.mockResolvedValueOnce(makeCredit({ balance: Money.fromInt(400) }));

      await expect(
        service.netOutIssuedCredit(EM, "student-1", Money.fromInt(1000), {
          receiptId: "original-receipt-1",
          actorId: "supervisor-1",
        }),
      ).rejects.toThrow(
        "Cannot reverse this receipt — KES 1000.0000 of the credit balance it created has already been applied to other invoices. Contact an administrator for a manual correction.",
      );
      expect(creditRepository.save).not.toHaveBeenCalled();
      expect(entryRepository.create).not.toHaveBeenCalled();
    });

    it("throws when the entire credit was already consumed (no row left at all)", async () => {
      await expect(
        service.netOutIssuedCredit(EM, "student-1", Money.fromInt(500), {
          receiptId: "original-receipt-1",
          actorId: "supervisor-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("getOrCreate", () => {
    it("returns the existing row unchanged when one already exists", async () => {
      const existing = makeCredit({ balance: Money.fromInt(50) });
      creditRepository.findByStudentId.mockResolvedValueOnce(existing);
      const result = await service.getOrCreate(EM, "student-1");
      expect(result).toBe(existing);
      expect(creditRepository.create).not.toHaveBeenCalled();
    });

    it("creates a fresh balance-0 row when none exists", async () => {
      await service.getOrCreate(EM, "student-1");
      expect(creditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: "student-1", balance: Money.ZERO }), EM);
    });
  });
});
