import { EntityManager } from "typeorm";
import { InvoicingService } from "../application/invoicing.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";

const EM = {} as EntityManager;

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    number: "DRAFT-invoice-1",
    studentId: "student-1",
    termId: "term-1",
    feeStructureId: null,
    structureVersion: null,
    issueDate: "2026-01-10",
    dueDate: "2026-01-10",
    status: "DRAFT",
    source: "STRUCTURE",
    subtotal: Money.fromInt(1000),
    concessionTotal: Money.ZERO,
    total: Money.fromInt(1000),
    paidAmount: Money.ZERO,
    balance: Money.fromInt(1000),
    journalId: null,
    voidReason: null,
    voidedBy: null,
    ...overrides,
  } as BillInvoiceEntity;
}

function makeInvoiceLine(overrides: Partial<BillInvoiceLineEntity>): BillInvoiceLineEntity {
  return {
    id: `line-${overrides.lineNo ?? 1}`,
    invoiceId: "invoice-1",
    lineNo: 1,
    feeCategoryId: "cat-tuition",
    description: "Tuition",
    amount: Money.fromInt(1000),
    concessionAmount: Money.ZERO,
    ...overrides,
  } as BillInvoiceLineEntity;
}

function makeConcession(overrides: Partial<BillConcessionEntity>): BillConcessionEntity {
  return {
    id: "conc-1",
    kind: "DISCOUNT",
    schemeId: "scheme-1",
    studentId: "student-1",
    invoiceId: "invoice-1",
    invoiceLineId: null,
    sponsorAwardId: null,
    amount: Money.fromInt(100),
    reason: "Discount",
    status: "APPROVED",
    approvalRef: "instance-1",
    journalId: null,
    ...overrides,
  } as BillConcessionEntity;
}

function makeAward(overrides: Partial<BillSponsorAwardEntity>): BillSponsorAwardEntity {
  return {
    id: "award-1",
    sponsorId: "sponsor-1",
    studentId: "student-1",
    termId: "term-1",
    amount: Money.fromInt(500),
    categoryScope: null,
    appliedAmount: Money.ZERO,
    ...overrides,
  } as BillSponsorAwardEntity;
}

describe("InvoicingService", () => {
  let invoiceRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock };
  let invoiceLineRepository: { listByInvoice: jest.Mock; create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock };
  let feeStructureLineRepository: { listByStructureAndTerm: jest.Mock };
  let optionalItemRepository: { listByStudentAndTerm: jest.Mock };
  let feeCategoryRepository: { findByIdOrFail: jest.Mock };
  let concessionRepository: { listByInvoice: jest.Mock; save: jest.Mock };
  let schemeRepository: { findByIdOrFail: jest.Mock };
  let sponsorAwardRepository: { findActiveForStudent: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let feeStructuresService: { findApplicableFor: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock };
  let postingService: { post: jest.Mock; reverse: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let studentLedgerService: { appendEntry: jest.Mock };
  let service: InvoicingService;

  const categories: Record<string, { id: string; name: string; glIncomeAccountId: string }> = {
    "cat-tuition": { id: "cat-tuition", name: "Tuition", glIncomeAccountId: "acc-income-tuition" },
    "cat-transport": { id: "cat-transport", name: "Transport", glIncomeAccountId: "acc-income-transport" },
  };

  beforeEach(() => {
    invoiceRepository = {
      findByIdOrFail: jest.fn(async () => makeInvoice({})),
      create: jest.fn(async (data) => makeInvoice(data)),
      save: jest.fn(async (e) => e),
    };
    invoiceLineRepository = {
      listByInvoice: jest.fn(async () => [makeInvoiceLine({})]),
      create: jest.fn(async (data) => makeInvoiceLine(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeInvoiceLine({})),
    };
    feeStructureLineRepository = { listByStructureAndTerm: jest.fn(async () => []) };
    optionalItemRepository = { listByStudentAndTerm: jest.fn(async () => []) };
    feeCategoryRepository = {
      findByIdOrFail: jest.fn(async (id: string) => categories[id] ?? { id, name: id, glIncomeAccountId: `acc-${id}` }),
    };
    concessionRepository = { listByInvoice: jest.fn(async () => []), save: jest.fn(async (e) => e) };
    schemeRepository = { findByIdOrFail: jest.fn(async () => ({ id: "scheme-1", glAccountId: "acc-concession-1" })) };
    sponsorAwardRepository = {
      findActiveForStudent: jest.fn(async () => []),
      findByIdOrFail: jest.fn(async () => makeAward({})),
      save: jest.fn(async (e) => e),
    };
    studentRepository = { findByIdOrFail: jest.fn(async () => ({ id: "student-1" })) };
    feeStructuresService = { findApplicableFor: jest.fn(async () => null) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [
        { id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain },
      ]),
    };
    postingService = {
      post: jest.fn(async () => ({ id: "journal-1", lines: [] })),
      reverse: jest.fn(async () => ({ id: "reversal-journal-1" })),
    };
    numberingService = { allocate: jest.fn(async () => "INV-000123") };
    studentLedgerService = { appendEntry: jest.fn(async () => undefined) };

    service = new InvoicingService(
      invoiceRepository as never,
      invoiceLineRepository as never,
      feeStructureLineRepository as never,
      optionalItemRepository as never,
      feeCategoryRepository as never,
      concessionRepository as never,
      schemeRepository as never,
      sponsorAwardRepository as never,
      studentRepository as never,
      feeStructuresService as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      studentLedgerService as never,
    );
  });

  // ---- generateInvoice ----

  describe("generateInvoice", () => {
    it("STRUCTURE: throws NotFoundException when no applicable PUBLISHED structure exists (BR-BILL-02)", async () => {
      feeStructuresService.findApplicableFor.mockResolvedValue(null);
      await expect(
        service.generateInvoice(EM, { studentId: "student-1", termId: "term-1", source: "STRUCTURE" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("STRUCTURE: includes every mandatory line and only opted-in optional lines, using the override amount when present", async () => {
      feeStructuresService.findApplicableFor.mockResolvedValue({ id: "structure-1", version: 3 });
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        { id: "sl-1", feeStructureId: "structure-1", feeCategoryId: "cat-tuition", amount: Money.fromInt(1000), isOptional: false },
        { id: "sl-2", feeStructureId: "structure-1", feeCategoryId: "cat-transport", amount: Money.fromInt(300), isOptional: true },
        { id: "sl-3", feeStructureId: "structure-1", feeCategoryId: "cat-other", amount: Money.fromInt(200), isOptional: true },
      ]);
      optionalItemRepository.listByStudentAndTerm.mockResolvedValue([
        { id: "opt-1", studentId: "student-1", termId: "term-1", feeCategoryId: "cat-transport", amountOverride: Money.fromInt(250) },
        // cat-other has NO opt-in row — must be excluded entirely.
      ]);

      const invoice = await service.generateInvoice(EM, { studentId: "student-1", termId: "term-1", source: "STRUCTURE" });

      expect(invoice.feeStructureId).toBe("structure-1");
      expect(invoice.structureVersion).toBe(3);
      expect(invoice.subtotal.equals(Money.fromInt(1250))).toBe(true); // 1000 + 250 override (not 300)
      expect(invoiceLineRepository.create).toHaveBeenCalledTimes(2);
      const createdCategoryIds = invoiceLineRepository.create.mock.calls.map((call) => call[0].feeCategoryId);
      expect(createdCategoryIds).toEqual(["cat-tuition", "cat-transport"]);
    });

    it("STRUCTURE: rethrows a unique-violation on the (student, term, structure) as ConflictException — BR-BILL-04 idempotency", async () => {
      feeStructuresService.findApplicableFor.mockResolvedValue({ id: "structure-1", version: 1 });
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        { id: "sl-1", feeStructureId: "structure-1", feeCategoryId: "cat-tuition", amount: Money.fromInt(1000), isOptional: false },
      ]);
      invoiceRepository.create.mockRejectedValue({ code: "23505" });

      await expect(
        service.generateInvoice(EM, { studentId: "student-1", termId: "term-1", source: "STRUCTURE" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("ADHOC: requires at least one adhocLines entry", async () => {
      await expect(
        service.generateInvoice(EM, { studentId: "student-1", termId: "term-1", source: "ADHOC", adhocLines: [] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("ADHOC: builds lines directly from adhocLines with no fee_structure_id", async () => {
      const invoice = await service.generateInvoice(EM, {
        studentId: "student-1",
        termId: "term-1",
        source: "ADHOC",
        adhocLines: [
          { feeCategoryId: "cat-tuition", description: "Late enrolment fee", amount: Money.fromInt(150) },
          { feeCategoryId: "cat-transport", description: "One-off trip", amount: Money.fromInt(50) },
        ],
      });

      expect(invoice.feeStructureId).toBeNull();
      expect(invoice.subtotal.equals(Money.fromInt(200))).toBe(true);
      expect(invoice.status).toBe("DRAFT");
    });
  });

  // ---- postInvoice ----

  describe("postInvoice", () => {
    it("rejects posting a non-DRAFT invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "POSTED" }));
      await expect(service.postInvoice(EM, "invoice-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("plain structure invoice, no concessions: P-01 debit AR-Student + credit per fee category, balanced", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ subtotal: Money.fromInt(1000), total: Money.fromInt(1000), balance: Money.fromInt(1000) }));
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(700) }),
        makeInvoiceLine({ id: "line-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(300) }),
      ]);

      const result = await service.postInvoice(EM, "invoice-1", "actor-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      const lines = draft.lines as { accountId: string; debit: Money; credit: Money }[];

      const totalDebit = lines.reduce((sum: Money, l) => sum.add(l.debit), Money.ZERO);
      const totalCredit = lines.reduce((sum: Money, l) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
      expect(totalDebit.equals(Money.fromInt(1000))).toBe(true);

      const arDebit = lines.find((l) => l.accountId === "acc-AR_STUDENT" && l.debit.isPositive());
      expect(arDebit?.debit.equals(Money.fromInt(1000))).toBe(true);

      const tuitionCredit = lines.find((l) => l.accountId === "acc-income-tuition");
      expect(tuitionCredit?.credit.equals(Money.fromInt(700))).toBe(true);
      const transportCredit = lines.find((l) => l.accountId === "acc-income-transport");
      expect(transportCredit?.credit.equals(Money.fromInt(300))).toBe(true);

      // No P-02/P-03/P-04 AR-Student credit line when nothing was folded.
      const arCredits = lines.filter((l) => l.accountId === "acc-AR_STUDENT" && l.credit.isPositive());
      expect(arCredits).toHaveLength(0);

      expect(result.number).toBe("INV-000123");
      expect(result.status).toBe("POSTED");
      expect(result.concessionTotal.isZero()).toBe(true);
      expect(result.total.equals(Money.fromInt(1000))).toBe(true);
      expect(result.balance.equals(Money.fromInt(1000))).toBe(true);
      expect(result.paidAmount.isZero()).toBe(true);
      expect(result.journalId).toBe("journal-1");

      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ studentId: "student-1", debit: expect.objectContaining({}), credit: Money.ZERO }),
      );
      const ledgerCall = studentLedgerService.appendEntry.mock.calls[0][1];
      expect(ledgerCall.debit.equals(Money.fromInt(1000))).toBe(true);
    });

    it("invoice with a folded concession: P-02 debit to scheme account + aggregate AR-Student credit, concession marked POSTED", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ subtotal: Money.fromInt(1000), total: Money.fromInt(1000), balance: Money.fromInt(1000) }));
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(1000) }),
      ]);
      concessionRepository.listByInvoice.mockResolvedValue([
        makeConcession({ id: "conc-1", kind: "DISCOUNT", schemeId: "scheme-1", sponsorAwardId: null, invoiceLineId: "line-1", amount: Money.fromInt(150), status: "APPROVED" }),
      ]);

      const result = await service.postInvoice(EM, "invoice-1", "actor-1");

      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money; credit: Money; memo?: string }[];
      const totalDebit = lines.reduce((sum: Money, l) => sum.add(l.debit), Money.ZERO);
      const totalCredit = lines.reduce((sum: Money, l) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);

      const schemeDebit = lines.find((l) => l.accountId === "acc-concession-1");
      expect(schemeDebit?.debit.equals(Money.fromInt(150))).toBe(true);
      expect(schemeDebit?.memo).toContain("P-02");

      const arCredit = lines.find((l) => l.accountId === "acc-AR_STUDENT" && l.credit.isPositive());
      expect(arCredit?.credit.equals(Money.fromInt(150))).toBe(true);

      expect(result.concessionTotal.equals(Money.fromInt(150))).toBe(true);
      expect(result.total.equals(Money.fromInt(850))).toBe(true);
      expect(result.balance.equals(Money.fromInt(850))).toBe(true);

      expect(concessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "conc-1", status: "POSTED", journalId: "journal-1" }),
        EM,
      );
      // Line-scoped concession reflected on the invoice line's own concession_amount.
      expect(invoiceLineRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "line-1", concessionAmount: expect.objectContaining({}) }),
        EM,
      );
      const savedLine = invoiceLineRepository.save.mock.calls[0][0];
      expect(savedLine.concessionAmount.equals(Money.fromInt(150))).toBe(true);
    });

    it("BR-BILL-06: rejects a line-scoped concession exceeding the line's own amount", async () => {
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(1000) }),
      ]);
      concessionRepository.listByInvoice.mockResolvedValue([
        makeConcession({ id: "conc-1", invoiceLineId: "line-1", amount: Money.fromInt(1500), status: "APPROVED" }),
      ]);

      await expect(service.postInvoice(EM, "invoice-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("invoice with sponsor coverage: P-03 auto-coverage debits AR-Sponsor and increments the award's applied_amount, in invoice-line order", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ subtotal: Money.fromInt(1000), total: Money.fromInt(1000), balance: Money.fromInt(1000) }));
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(700) }),
        makeInvoiceLine({ id: "line-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(300) }),
      ]);
      sponsorAwardRepository.findActiveForStudent.mockResolvedValue([
        makeAward({ id: "award-1", amount: Money.fromInt(500), appliedAmount: Money.ZERO, categoryScope: null }),
      ]);

      const result = await service.postInvoice(EM, "invoice-1", "actor-1");

      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money; credit: Money; memo?: string }[];
      const sponsorDebit = lines.find((l) => l.accountId === "acc-AR_SPONSOR");
      expect(sponsorDebit?.debit.equals(Money.fromInt(500))).toBe(true); // capped at award balance, consumed from line-1 first (700 >= 500)

      const arCredit = lines.find((l) => l.accountId === "acc-AR_STUDENT" && l.credit.isPositive());
      expect(arCredit?.credit.equals(Money.fromInt(500))).toBe(true);

      expect(result.concessionTotal.equals(Money.fromInt(500))).toBe(true);
      expect(result.total.equals(Money.fromInt(500))).toBe(true);
      expect(result.paidAmount.isZero()).toBe(true); // sponsor coverage does NOT touch paid_amount (see class doc comment)

      expect(sponsorAwardRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "award-1", appliedAmount: expect.objectContaining({}) }),
        EM,
      );
      const savedAward = sponsorAwardRepository.save.mock.calls[0][0];
      expect(savedAward.appliedAmount.equals(Money.fromInt(500))).toBe(true);
    });

    it("respects category_scope: an award only covers its listed categories", async () => {
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(700) }),
        makeInvoiceLine({ id: "line-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(300) }),
      ]);
      sponsorAwardRepository.findActiveForStudent.mockResolvedValue([
        makeAward({ id: "award-1", amount: Money.fromInt(1000), appliedAmount: Money.ZERO, categoryScope: ["cat-transport"] }),
      ]);

      await service.postInvoice(EM, "invoice-1", "actor-1");

      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money }[];
      const sponsorDebit = lines.find((l) => l.accountId === "acc-AR_SPONSOR");
      expect(sponsorDebit?.debit.equals(Money.fromInt(300))).toBe(true); // only the transport line, capped there
    });

    it("invoice with BOTH a folded concession and sponsor coverage: both reductions fold into one balanced journal", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ subtotal: Money.fromInt(1000), total: Money.fromInt(1000), balance: Money.fromInt(1000) }));
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(700) }),
        makeInvoiceLine({ id: "line-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(300) }),
      ]);
      concessionRepository.listByInvoice.mockResolvedValue([
        makeConcession({ id: "conc-1", invoiceLineId: "line-2", schemeId: "scheme-1", sponsorAwardId: null, amount: Money.fromInt(100), status: "APPROVED" }),
      ]);
      sponsorAwardRepository.findActiveForStudent.mockResolvedValue([
        makeAward({ id: "award-1", amount: Money.fromInt(500), appliedAmount: Money.ZERO, categoryScope: null }),
      ]);

      const result = await service.postInvoice(EM, "invoice-1", "actor-1");

      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money; credit: Money }[];
      const totalDebit = lines.reduce((sum: Money, l) => sum.add(l.debit), Money.ZERO);
      const totalCredit = lines.reduce((sum: Money, l) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
      // Every folded reduction (concession + sponsor coverage) gets its own
      // debit line ON TOP OF the P-01 AR-Student subtotal debit, balanced by
      // the fee-income credits (=subtotal) plus one aggregate AR-Student
      // credit (=foldedTotal) — so total debit = subtotal + foldedTotal.
      expect(totalDebit.equals(Money.fromInt(1000).add(Money.fromInt(600)))).toBe(true);

      // 100 (concession, capped at line-2's own 300) + 500 (sponsor auto-coverage, capped at the award's own
      // balance — consumed from line-1 first in invoice-line order since line-1 still has its full 700 capacity).
      expect(result.concessionTotal.equals(Money.fromInt(600))).toBe(true);
      expect(result.total.equals(Money.fromInt(400))).toBe(true);
      expect(result.balance.equals(Money.fromInt(400))).toBe(true);
    });
  });

  // ---- voidInvoice ----

  describe("voidInvoice", () => {
    it("rejects an invoice with paid_amount > 0 (BR-BILL-09)", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "PARTIALLY_PAID", paidAmount: Money.fromInt(100), journalId: "journal-1" }),
      );
      await expect(service.voidInvoice(EM, "invoice-1", "reason", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects voiding a non-POSTED invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "DRAFT" }));
      await expect(service.voidInvoice(EM, "invoice-1", "reason", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("reverses the journal and flips status to VOID when paid_amount = 0", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "POSTED", paidAmount: Money.ZERO, journalId: "journal-1" }),
      );

      const result = await service.voidInvoice(EM, "invoice-1", "Enrolment cancelled", "actor-1");

      expect(postingService.reverse).toHaveBeenCalledWith(EM, "journal-1", "Enrolment cancelled", "actor-1");
      expect(result.status).toBe("VOID");
      expect(result.voidReason).toBe("Enrolment cancelled");
      expect(result.voidedBy).toBe("actor-1");
    });
  });
});
