import { DataSource, EntityManager } from "typeorm";
import { ChequesService } from "../application/cheques.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayChequeEntity } from "../domain/pay-cheque.entity";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";
import { BillInstallmentEntity } from "../../billing/domain/bill-installment.entity";

const EM = {} as EntityManager;

function makeCheque(overrides: Partial<PayChequeEntity>): PayChequeEntity {
  return {
    id: "cheque-1",
    bankName: "KCB",
    chequeNo: "000123",
    chequeDate: "2026-07-01",
    drawer: "Jane Doe",
    amount: Money.fromInt(1000),
    status: "UNCLEARED",
    statusChangedAt: null,
    bounceFeeApplied: false,
    ...overrides,
  } as PayChequeEntity;
}

function makeSplit(overrides: Partial<PayReceiptSplitEntity>): PayReceiptSplitEntity {
  return {
    id: "split-1",
    receiptId: "receipt-1",
    method: "CHEQUE",
    amount: Money.fromInt(1000),
    chequeId: "cheque-1",
    ...overrides,
  } as PayReceiptSplitEntity;
}

function makeReceipt(overrides: Partial<PayReceiptEntity>): PayReceiptEntity {
  return {
    id: "receipt-1",
    number: "PAY-000001",
    studentId: "student-1",
    status: "POSTED",
    journalId: "journal-1",
    total: Money.fromInt(1000),
    ...overrides,
  } as PayReceiptEntity;
}

function makeAllocation(overrides: Partial<PayReceiptAllocationEntity>): PayReceiptAllocationEntity {
  return {
    id: "alloc-1",
    receiptId: "receipt-1",
    invoiceId: "invoice-1",
    installmentId: null,
    toPrepayment: false,
    amount: Money.fromInt(1000),
    ...overrides,
  } as PayReceiptAllocationEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    status: "PAID",
    total: Money.fromInt(1000),
    paidAmount: Money.fromInt(1000),
    balance: Money.ZERO,
    ...overrides,
  } as BillInvoiceEntity;
}

function makeInstallment(overrides: Partial<BillInstallmentEntity>): BillInstallmentEntity {
  return {
    id: "inst-1",
    invoiceId: "invoice-1",
    seq: 1,
    amount: Money.fromInt(1000),
    settledAmount: Money.fromInt(1000),
    ...overrides,
  } as BillInstallmentEntity;
}

describe("ChequesService", () => {
  let chequeRepository: { findByIdOrFail: jest.Mock; save: jest.Mock; findUncleared: jest.Mock };
  let splitRepository: { listByChequeId: jest.Mock; listByReceipt: jest.Mock };
  let receiptRepository: { findByIdOrFail: jest.Mock };
  let allocationRepository: { listByReceipt: jest.Mock };
  let invoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let installmentRepository: { listByInvoice: jest.Mock; save: jest.Mock };
  let feeCategoryRepository: { findByName: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock; reverse: jest.Mock };
  let receiptsService: { reverseReceipt: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let academicCalendarService: { getCurrentTerm: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let dataSource: DataSource;
  let service: ChequesService;

  beforeEach(() => {
    chequeRepository = {
      findByIdOrFail: jest.fn(async () => makeCheque({})),
      save: jest.fn(async (e) => e),
      findUncleared: jest.fn(async () => [makeCheque({})]),
    };
    splitRepository = {
      listByChequeId: jest.fn(async () => [makeSplit({})]),
      listByReceipt: jest.fn(async () => [makeSplit({})]),
    };
    receiptRepository = { findByIdOrFail: jest.fn(async () => makeReceipt({})) };
    allocationRepository = { listByReceipt: jest.fn(async () => [makeAllocation({})]) };
    invoiceRepository = { findByIdOrFail: jest.fn(async () => makeInvoice({})), save: jest.fn(async (e) => e) };
    installmentRepository = { listByInvoice: jest.fn(async () => [makeInstallment({})]), save: jest.fn(async (e) => e) };
    feeCategoryRepository = { findByName: jest.fn(async () => ({ id: "bounce-fee-category-1" })) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [{ id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain }]),
      findByCode: jest.fn(async (code: string) => ({ id: `acc-code-${code}`, code, isActive: true, isPostable: true })),
    };
    postingService = { post: jest.fn(async () => ({ id: "narrow-journal-1", lines: [] })), reverse: jest.fn(async () => ({ id: "reversal-journal-1" })) };
    receiptsService = { reverseReceipt: jest.fn(async () => ({ id: "contra-receipt-1", number: "RVS-000001" })) };
    invoicingService = {
      generateInvoice: jest.fn(async () => ({ id: "bounce-fee-invoice-1" })),
      postInvoice: jest.fn(async () => ({ id: "bounce-fee-invoice-1", journalId: "bounce-fee-journal-1" })),
    };
    academicCalendarService = { getCurrentTerm: jest.fn(async () => ({ id: "term-1" })) };
    settingsService = { getTyped: jest.fn(async (_key: string, defaultValue: unknown) => defaultValue) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work({} as EntityManager)),
    } as unknown as DataSource;

    service = new ChequesService(
      chequeRepository as never,
      splitRepository as never,
      receiptRepository as never,
      allocationRepository as never,
      invoiceRepository as never,
      installmentRepository as never,
      feeCategoryRepository as never,
      glAccountRepository as never,
      postingService as never,
      receiptsService as never,
      invoicingService as never,
      academicCalendarService as never,
      settingsService as never,
      dataSource,
    );
  });

  describe("clear", () => {
    it("rejects clearing a non-UNCLEARED cheque", async () => {
      chequeRepository.findByIdOrFail.mockResolvedValueOnce(makeCheque({ status: "CLEARED" }));
      await expect(service.clear("cheque-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("transitions UNCLEARED -> CLEARED", async () => {
      const cheque = await service.clear("cheque-1");
      expect(cheque.status).toBe("CLEARED");
      expect(chequeRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "CLEARED" }), expect.anything());
    });
  });

  describe("bounce — validation", () => {
    it("rejects bouncing a non-UNCLEARED cheque", async () => {
      chequeRepository.findByIdOrFail.mockResolvedValueOnce(makeCheque({ status: "BOUNCED" }));
      await expect(service.bounce(EM, "cheque-1", false, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("throws a data-integrity Error when no pay_receipt_split references the cheque", async () => {
      splitRepository.listByChequeId.mockResolvedValueOnce([]);
      await expect(service.bounce(EM, "cheque-1", false, "actor-1")).rejects.toThrow(/data integrity/i);
    });

    it("rejects when the linked receipt is not POSTED", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(makeReceipt({ status: "REVERSED" }));
      await expect(service.bounce(EM, "cheque-1", false, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("bounce — single-split-on-receipt path (full reverseReceipt)", () => {
    it("delegates entirely to ReceiptsService.reverseReceipt() with reasonCode BOUNCE and no approvalRef", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({})]); // exactly one split on the receipt

      const cheque = await service.bounce(EM, "cheque-1", false, "actor-1");

      expect(receiptsService.reverseReceipt).toHaveBeenCalledWith(EM, "receipt-1", "BOUNCE", null, "actor-1");
      expect(postingService.post).not.toHaveBeenCalled();
      expect(cheque.status).toBe("BOUNCED");
      expect(cheque.bounceFeeApplied).toBe(false);
    });
  });

  describe("bounce — multi-split-on-receipt path (narrow reversal)", () => {
    it("does NOT call reverseReceipt; posts a narrow P-11 journal for just the cheque's own amount", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([
        makeSplit({ id: "split-cash", method: "CASH", amount: Money.fromInt(500) }),
        makeSplit({ id: "split-cheque", method: "CHEQUE", amount: Money.fromInt(1000) }),
      ]);

      await service.bounce(EM, "cheque-1", false, "actor-1");

      expect(receiptsService.reverseReceipt).not.toHaveBeenCalled();
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: "acc-AR_STUDENT", debit: Money.fromInt(1000), credit: Money.ZERO }),
        expect.objectContaining({ accountId: "acc-code-1030", debit: Money.ZERO, credit: Money.fromInt(1000) }),
      ]);
    });

    it("unwinds only the cheque's own portion of the invoice/installment balances (walking allocations in reverse)", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([
        makeSplit({ id: "split-cash", method: "CASH", amount: Money.fromInt(500) }),
        makeSplit({ id: "split-cheque", method: "CHEQUE", amount: Money.fromInt(1000) }),
      ]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000) })]);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(makeInvoice({ paidAmount: Money.fromInt(1500), balance: Money.ZERO, status: "PAID" }));

      await service.bounce(EM, "cheque-1", false, "actor-1");

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: Money.fromInt(500), balance: Money.fromInt(1000), status: "PARTIALLY_PAID" }),
        EM,
      );
    });

    it("does not touch pay_receipt/pay_receipt_split/pay_receipt_allocation rows in the narrow path", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([
        makeSplit({ id: "split-cash", method: "CASH", amount: Money.fromInt(500) }),
        makeSplit({ id: "split-cheque", method: "CHEQUE", amount: Money.fromInt(1000) }),
      ]);
      await service.bounce(EM, "cheque-1", false, "actor-1");
      expect(receiptsService.reverseReceipt).not.toHaveBeenCalled();
    });
  });

  describe("bounce — bounce fee (P-05, via InvoicingService)", () => {
    it("applies the bounce fee via InvoicingService when applyBounceFee=true", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({})]);

      const cheque = await service.bounce(EM, "cheque-1", true, "actor-1");

      expect(feeCategoryRepository.findByName).toHaveBeenCalledWith("Cheque Bounce Fee", EM);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
      expect(invoicingService.postInvoice).toHaveBeenCalledWith(EM, "bounce-fee-invoice-1", "actor-1");
      expect(cheque.bounceFeeApplied).toBe(true);
    });

    it("throws NotFoundException when the Cheque Bounce Fee category is not seeded", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({})]);
      feeCategoryRepository.findByName.mockResolvedValueOnce(null);

      await expect(service.bounce(EM, "cheque-1", true, "actor-1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws when no current term is configured", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({})]);
      academicCalendarService.getCurrentTerm.mockResolvedValueOnce(null);

      await expect(service.bounce(EM, "cheque-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("does not apply a bounce fee when applyBounceFee=false", async () => {
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({})]);
      const cheque = await service.bounce(EM, "cheque-1", false, "actor-1");
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
      expect(cheque.bounceFeeApplied).toBe(false);
    });
  });
});
