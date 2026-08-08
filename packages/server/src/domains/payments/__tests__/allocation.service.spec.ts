import { EntityManager } from "typeorm";
import { AllocationService } from "../application/allocation.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";

const EM = {} as EntityManager;

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    number: "INV-000001",
    studentId: "student-1",
    dueDate: "2026-01-10",
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

describe("AllocationService", () => {
  let settingsService: { getTyped: jest.Mock };
  let invoiceRepository: { findOpenForStudent: jest.Mock };
  let service: AllocationService;

  beforeEach(() => {
    settingsService = { getTyped: jest.fn(async (_key: string, defaultValue: unknown) => defaultValue) };
    invoiceRepository = { findOpenForStudent: jest.fn(async () => []) };
    service = new AllocationService(settingsService as never, invoiceRepository as never);
  });

  it("rejects a non-positive amount", async () => {
    await expect(
      service.resolveAllocations(EM, { studentId: "student-1", amount: Money.ZERO }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("rejects an allocation rule other than OLDEST_FIRST", async () => {
    settingsService.getTyped.mockResolvedValueOnce("CATEGORY_PRIORITY");
    await expect(
      service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(100) }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("with no open invoices, the entire amount lands in prepayment (BR-PAY-03)", async () => {
    const result = await service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(500) });
    expect(result).toEqual([{ amount: Money.fromInt(500), toPrepayment: true }]);
  });

  it("allocates fully to a single open invoice with no remainder", async () => {
    invoiceRepository.findOpenForStudent.mockResolvedValueOnce([
      makeInvoice({ id: "invoice-1", balance: Money.fromInt(1000) }),
    ]);
    const result = await service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(1000) });
    expect(result).toEqual([{ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }]);
  });

  it("allocates oldest-first across multiple invoices, remainder to prepayment", async () => {
    invoiceRepository.findOpenForStudent.mockResolvedValueOnce([
      makeInvoice({ id: "invoice-old", dueDate: "2026-01-01", balance: Money.fromInt(300) }),
      makeInvoice({ id: "invoice-new", dueDate: "2026-02-01", balance: Money.fromInt(400) }),
    ]);
    const result = await service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(1000) });
    expect(result).toEqual([
      { invoiceId: "invoice-old", amount: Money.fromInt(300), toPrepayment: false },
      { invoiceId: "invoice-new", amount: Money.fromInt(400), toPrepayment: false },
      { amount: Money.fromInt(300), toPrepayment: true },
    ]);
    // BR-PAY-03: never leave a remainder unaccounted for.
    const sum = result.reduce((acc, alloc) => acc.add(alloc.amount), Money.ZERO);
    expect(sum.equals(Money.fromInt(1000))).toBe(true);
  });

  it("exhausts every open invoice exactly with nothing left over when amount matches total balance", async () => {
    invoiceRepository.findOpenForStudent.mockResolvedValueOnce([
      makeInvoice({ id: "invoice-a", balance: Money.fromInt(200) }),
      makeInvoice({ id: "invoice-b", balance: Money.fromInt(300) }),
    ]);
    const result = await service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(500) });
    expect(result).toEqual([
      { invoiceId: "invoice-a", amount: Money.fromInt(200), toPrepayment: false },
      { invoiceId: "invoice-b", amount: Money.fromInt(300), toPrepayment: false },
    ]);
  });

  /**
   * Phase 6 Slice 8 (Part 3) — "Collect Fees" directed multi-invoice
   * collection. `findOpenForStudent()` always returns a student's 3 open
   * invoices, oldest-due-date-first (`invoice-old`/`invoice-mid`/
   * `invoice-new`) across every case below — `invoiceIds` is what narrows the
   * candidate set, never the mock itself, so these tests exercise the real
   * `.filter()` logic, not a pre-filtered fixture.
   */
  describe("invoiceIds scoping", () => {
    function threeOpenInvoices() {
      return [
        makeInvoice({ id: "invoice-old", dueDate: "2026-01-01", balance: Money.fromInt(300) }),
        makeInvoice({ id: "invoice-mid", dueDate: "2026-02-01", balance: Money.fromInt(400) }),
        makeInvoice({ id: "invoice-new", dueDate: "2026-03-01", balance: Money.fromInt(500) }),
      ];
    }

    it("(a) restricts allocation to exactly the 2 checked invoices, skipping the unchecked one even though it would be FIFO-eligible", async () => {
      invoiceRepository.findOpenForStudent.mockResolvedValueOnce(threeOpenInvoices());
      // Deliberately checks the OLDEST and the NEWEST, skipping the middle
      // one — proves real filtering, not just "first N" slicing.
      const result = await service.resolveAllocations(EM, {
        studentId: "student-1",
        amount: Money.fromInt(800),
        invoiceIds: ["invoice-old", "invoice-new"],
      });
      expect(result).toEqual([
        { invoiceId: "invoice-old", amount: Money.fromInt(300), toPrepayment: false },
        { invoiceId: "invoice-new", amount: Money.fromInt(500), toPrepayment: false },
      ]);
      // invoice-mid never appears anywhere in the result.
      expect(result.some((a) => a.invoiceId === "invoice-mid")).toBe(false);
    });

    it("(b) omitted invoiceIds — unscoped FIFO across ALL open invoices, unchanged from before this field existed (regression guard)", async () => {
      invoiceRepository.findOpenForStudent.mockResolvedValueOnce(threeOpenInvoices());
      const result = await service.resolveAllocations(EM, { studentId: "student-1", amount: Money.fromInt(1200) });
      expect(result).toEqual([
        { invoiceId: "invoice-old", amount: Money.fromInt(300), toPrepayment: false },
        { invoiceId: "invoice-mid", amount: Money.fromInt(400), toPrepayment: false },
        { invoiceId: "invoice-new", amount: Money.fromInt(500), toPrepayment: false },
      ]);
    });

    it("(b') empty invoiceIds array — treated identically to omitted (unscoped), not as 'select nothing'", async () => {
      invoiceRepository.findOpenForStudent.mockResolvedValueOnce(threeOpenInvoices());
      const result = await service.resolveAllocations(EM, {
        studentId: "student-1",
        amount: Money.fromInt(300),
        invoiceIds: [],
      });
      expect(result).toEqual([{ invoiceId: "invoice-old", amount: Money.fromInt(300), toPrepayment: false }]);
    });

    it("(c) amount less than the checked-invoices total — partial, oldest-of-the-checked-set-first", async () => {
      invoiceRepository.findOpenForStudent.mockResolvedValueOnce(threeOpenInvoices());
      // Checked set is {invoice-mid, invoice-new} (total 900); amount only
      // covers invoice-mid in full plus a partial slice of invoice-new.
      // invoice-old (cheaper, oldest overall) is deliberately NOT checked and
      // must receive nothing despite being FIFO-eligible under the unscoped rule.
      const result = await service.resolveAllocations(EM, {
        studentId: "student-1",
        amount: Money.fromInt(450),
        invoiceIds: ["invoice-mid", "invoice-new"],
      });
      expect(result).toEqual([
        { invoiceId: "invoice-mid", amount: Money.fromInt(400), toPrepayment: false },
        { invoiceId: "invoice-new", amount: Money.fromInt(50), toPrepayment: false },
      ]);
      expect(result.some((a) => a.invoiceId === "invoice-old")).toBe(false);
    });

    it("(d) amount more than the checked-invoices total — excess still becomes toPrepayment exactly as today (BR-PAY-03 unaffected by scoping)", async () => {
      invoiceRepository.findOpenForStudent.mockResolvedValueOnce(threeOpenInvoices());
      // Checked set is just {invoice-old} (balance 300); amount is 1000, so
      // 700 must land in prepayment — NOT spill onto invoice-mid/invoice-new
      // even though they're real open invoices with real balances.
      const result = await service.resolveAllocations(EM, {
        studentId: "student-1",
        amount: Money.fromInt(1000),
        invoiceIds: ["invoice-old"],
      });
      expect(result).toEqual([
        { invoiceId: "invoice-old", amount: Money.fromInt(300), toPrepayment: false },
        { amount: Money.fromInt(700), toPrepayment: true },
      ]);
      const sum = result.reduce((acc, alloc) => acc.add(alloc.amount), Money.ZERO);
      expect(sum.equals(Money.fromInt(1000))).toBe(true);
    });
  });
});
