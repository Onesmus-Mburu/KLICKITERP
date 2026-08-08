import { DataSource, EntityManager } from "typeorm";
import { BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE, CreditNotesService } from "../application/credit-notes.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "../domain/bill-credit-note-line.entity";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";

const EM = {} as EntityManager;

function makeCreditNote(overrides: Partial<BillCreditNoteEntity>): BillCreditNoteEntity {
  return {
    id: "cn-1",
    number: "DRAFT-cn-1",
    invoiceId: "invoice-1",
    reason: "Overcharge correction",
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    total: Money.fromInt(150),
    ...overrides,
  } as BillCreditNoteEntity;
}

function makeCreditNoteLine(overrides: Partial<BillCreditNoteLineEntity>): BillCreditNoteLineEntity {
  return {
    id: `cnl-${overrides.lineNo ?? 1}`,
    creditNoteId: "cn-1",
    lineNo: 1,
    feeCategoryId: "cat-tuition",
    description: "Tuition",
    amount: Money.fromInt(150),
    ...overrides,
  } as BillCreditNoteLineEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    number: "INV-000001",
    studentId: "student-1",
    status: "POSTED",
    subtotal: Money.fromInt(1000),
    concessionTotal: Money.ZERO,
    total: Money.fromInt(1000),
    paidAmount: Money.ZERO,
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

function makeInvoiceLine(overrides: Partial<BillInvoiceLineEntity>): BillInvoiceLineEntity {
  return {
    id: "line-1",
    invoiceId: "invoice-1",
    lineNo: 1,
    feeCategoryId: "cat-tuition",
    description: "Tuition",
    amount: Money.fromInt(700),
    concessionAmount: Money.ZERO,
    ...overrides,
  } as BillInvoiceLineEntity;
}

const categories: Record<string, { id: string; name: string; glIncomeAccountId: string }> = {
  "cat-tuition": { id: "cat-tuition", name: "Tuition", glIncomeAccountId: "acc-income-tuition" },
  "cat-transport": { id: "cat-transport", name: "Transport", glIncomeAccountId: "acc-income-transport" },
};

describe("CreditNotesService", () => {
  let creditNoteRepository: { findByIdOrFail: jest.Mock; listByInvoice: jest.Mock; create: jest.Mock; save: jest.Mock };
  let creditNoteLineRepository: { listByCreditNote: jest.Mock; create: jest.Mock };
  let invoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let invoiceLineRepository: { listByInvoice: jest.Mock };
  let feeCategoryRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let studentLedgerService: { appendEntry: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let dataSource: DataSource;
  let service: CreditNotesService;

  beforeEach(() => {
    creditNoteRepository = {
      findByIdOrFail: jest.fn(async () => makeCreditNote({})),
      listByInvoice: jest.fn(async () => []),
      create: jest.fn(async (data) => makeCreditNote(data)),
      save: jest.fn(async (e) => e),
    };
    creditNoteLineRepository = {
      listByCreditNote: jest.fn(async () => [makeCreditNoteLine({})]),
      create: jest.fn(async (data) => makeCreditNoteLine(data)),
    };
    invoiceRepository = { findByIdOrFail: jest.fn(async () => makeInvoice({})), save: jest.fn(async (e) => e) };
    invoiceLineRepository = { listByInvoice: jest.fn(async () => [makeInvoiceLine({})]) };
    feeCategoryRepository = {
      findByIdOrFail: jest.fn(async (id: string) => categories[id] ?? { id, name: id, glIncomeAccountId: `acc-${id}` }),
    };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [
        { id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain },
      ]),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1" })) };
    numberingService = { allocate: jest.fn(async () => "CN-000001") };
    studentLedgerService = { appendEntry: jest.fn(async () => undefined) };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new CreditNotesService(
      creditNoteRepository as never,
      creditNoteLineRepository as never,
      invoiceRepository as never,
      invoiceLineRepository as never,
      feeCategoryRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      studentLedgerService as never,
      approvalEngine as never,
      dataSource,
    );
  });

  describe("create", () => {
    const baseInput = { invoiceId: "invoice-1", reason: "Overcharge correction" };

    it("rejects an empty lines array", async () => {
      await expect(service.create({ ...baseInput, lines: [] }, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a target invoice that is not POSTED/PARTIALLY_PAID/PAID (BR-BILL-09)", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "DRAFT" }));
      await expect(
        service.create({ ...baseInput, lines: [{ feeCategoryId: "cat-tuition", amount: Money.fromInt(100) }] }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line whose fee category does not appear on the original invoice", async () => {
      invoiceLineRepository.listByInvoice.mockResolvedValue([makeInvoiceLine({ feeCategoryId: "cat-tuition" })]);
      await expect(
        service.create(
          { ...baseInput, lines: [{ feeCategoryId: "cat-transport", amount: Money.fromInt(50) }] },
          "initiator-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line amount exceeding the original invoice line's own amount", async () => {
      invoiceLineRepository.listByInvoice.mockResolvedValue([makeInvoiceLine({ feeCategoryId: "cat-tuition", amount: Money.fromInt(700) })]);
      await expect(
        service.create(
          { ...baseInput, lines: [{ feeCategoryId: "cat-tuition", amount: Money.fromInt(800) }] },
          "initiator-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("builds a DRAFT note + lines, summing total, with no GL activity", async () => {
      invoiceLineRepository.listByInvoice.mockResolvedValue([
        makeInvoiceLine({ id: "line-1", feeCategoryId: "cat-tuition", amount: Money.fromInt(700) }),
        makeInvoiceLine({ id: "line-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(300) }),
      ]);

      const note = await service.create(
        {
          ...baseInput,
          lines: [
            { feeCategoryId: "cat-tuition", amount: Money.fromInt(200) },
            { feeCategoryId: "cat-transport", amount: Money.fromInt(100) },
          ],
        },
        "initiator-1",
      );

      expect(note.status).toBe("DRAFT");
      expect(creditNoteLineRepository.create).toHaveBeenCalledTimes(2);
      expect(postingService.post).not.toHaveBeenCalled();
      const created = creditNoteRepository.create.mock.calls[0][0];
      expect(created.total.equals(Money.fromInt(300))).toBe(true);
    });
  });

  describe("submitForApproval", () => {
    it("rejects a non-DRAFT note", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED" }));
      await expect(service.submitForApproval("cn-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("calls ApprovalEngineService.submit with the right domain code and transitions to PENDING_APPROVAL", async () => {
      const result = await service.submitForApproval("cn-1", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          domainCode: BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE,
          entityType: "bill_credit_note",
          entityId: "cn-1",
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("instance-1");
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a note that is not PENDING_APPROVAL", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("cn-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved=true transitions to APPROVED", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("cn-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("approved=false reverts to DRAFT (BillNoteStatus has no REJECTED value)", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("cn-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
    });
  });

  describe("post — P-06", () => {
    it("rejects a note that is not APPROVED", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "DRAFT" }));
      await expect(service.post(EM, "cn-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects posting against a VOID invoice", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "VOID" }));
      await expect(service.post(EM, "cn-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a note total exceeding the invoice's balance", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED", total: Money.fromInt(5000) }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(1000) }));
      await expect(service.post(EM, "cn-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("posts P-06: debit each original line's fee-income account, credit AR-Student control for the aggregate total", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED", total: Money.fromInt(150) }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "POSTED", paidAmount: Money.ZERO, balance: Money.fromInt(1000) }),
      );
      creditNoteLineRepository.listByCreditNote.mockResolvedValue([
        makeCreditNoteLine({ id: "cnl-1", lineNo: 1, feeCategoryId: "cat-tuition", amount: Money.fromInt(100) }),
        makeCreditNoteLine({ id: "cnl-2", lineNo: 2, feeCategoryId: "cat-transport", amount: Money.fromInt(50) }),
      ]);

      const result = await service.post(EM, "cn-1", "actor-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money; credit: Money }[];
      const totalDebit = lines.reduce((sum: Money, l) => sum.add(l.debit), Money.ZERO);
      const totalCredit = lines.reduce((sum: Money, l) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
      expect(totalDebit.equals(Money.fromInt(150))).toBe(true);

      const tuitionDebit = lines.find((l) => l.accountId === "acc-income-tuition");
      expect(tuitionDebit?.debit.equals(Money.fromInt(100))).toBe(true);
      const transportDebit = lines.find((l) => l.accountId === "acc-income-transport");
      expect(transportDebit?.debit.equals(Money.fromInt(50))).toBe(true);

      const arCredit = lines.find((l) => l.accountId === "acc-AR_STUDENT");
      expect(arCredit?.credit.equals(Money.fromInt(150))).toBe(true);

      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
      expect(result.number).toBe("CN-000001");
    });

    it("reduces the invoice via paid_amount/balance (same convention as ConcessionsService.postStandalone) and appends a std_ledger_entry credit", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED", total: Money.fromInt(150) }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "POSTED", paidAmount: Money.ZERO, balance: Money.fromInt(1000) }),
      );

      await service.post(EM, "cn-1", "actor-1");

      const savedInvoice = invoiceRepository.save.mock.calls[0][0];
      expect(savedInvoice.paidAmount.equals(Money.fromInt(150))).toBe(true);
      expect(savedInvoice.balance.equals(Money.fromInt(850))).toBe(true);
      expect(savedInvoice.status).toBe("PARTIALLY_PAID");

      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ studentId: "student-1", debit: Money.ZERO, credit: expect.objectContaining({}) }),
      );
      const ledgerCall = studentLedgerService.appendEntry.mock.calls[0][1];
      expect(ledgerCall.credit.equals(Money.fromInt(150))).toBe(true);
    });

    it("fully covers the invoice's balance -> status flips to PAID", async () => {
      creditNoteRepository.findByIdOrFail.mockResolvedValue(makeCreditNote({ status: "APPROVED", total: Money.fromInt(1000) }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "POSTED", paidAmount: Money.ZERO, balance: Money.fromInt(1000) }),
      );

      await service.post(EM, "cn-1", "actor-1");

      const savedInvoice = invoiceRepository.save.mock.calls[0][0];
      expect(savedInvoice.balance.isZero()).toBe(true);
      expect(savedInvoice.status).toBe("PAID");
    });
  });
});
