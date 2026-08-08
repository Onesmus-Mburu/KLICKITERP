import { EntityManager } from "typeorm";
import { ReceiptsService } from "../application/receipts.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";
import { BillInstallmentEntity } from "../../billing/domain/bill-installment.entity";

const EM = {} as EntityManager;

function makeReceipt(overrides: Partial<PayReceiptEntity>): PayReceiptEntity {
  return {
    id: "receipt-1",
    number: "PAY-000001",
    studentId: "student-1",
    payerName: "John Doe",
    payerPhone: null,
    receiptDate: "2026-07-15",
    total: Money.fromInt(1000),
    status: "POSTED",
    reversalOfId: null,
    reversalReason: null,
    approvalRef: null,
    cashierId: "cashier-1",
    sessionId: "session-1",
    journalId: "journal-1",
    idempotencyKey: null,
    balanceAfter: Money.ZERO,
    reprintCount: 0,
    ...overrides,
  } as PayReceiptEntity;
}

function makeSplit(overrides: Partial<PayReceiptSplitEntity>): PayReceiptSplitEntity {
  return {
    id: "split-1",
    receiptId: "receipt-1",
    method: "CASH",
    amount: Money.fromInt(1000),
    bankAccountId: null,
    chequeId: null,
    mpesaTransactionId: null,
    externalRef: null,
    ...overrides,
  } as PayReceiptSplitEntity;
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

function makeSession(overrides: Partial<PayCashierSessionEntity>): PayCashierSessionEntity {
  return {
    id: "session-1",
    cashierId: "cashier-1",
    till: "TILL-01",
    status: "OPEN",
    ...overrides,
  } as PayCashierSessionEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    number: "INV-000001",
    studentId: "student-1",
    status: "POSTED",
    total: Money.fromInt(1000),
    paidAmount: Money.ZERO,
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

function makeInstallment(overrides: Partial<BillInstallmentEntity>): BillInstallmentEntity {
  return {
    id: "inst-1",
    invoiceId: "invoice-1",
    seq: 1,
    dueDate: "2026-01-10",
    amount: Money.fromInt(1000),
    settledAmount: Money.ZERO,
    ...overrides,
  } as BillInstallmentEntity;
}

describe("ReceiptsService", () => {
  let receiptRepository: { findByIdempotencyKey: jest.Mock; create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock };
  let splitRepository: { create: jest.Mock; listByReceipt: jest.Mock };
  let allocationRepository: { create: jest.Mock; listByReceipt: jest.Mock };
  let chequeRepository: { create: jest.Mock };
  let sessionRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock; reverse: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let studentLedgerService: { appendEntry: jest.Mock };
  let ledgerEntryRepository: { getStatementWithRunningBalance: jest.Mock };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let invoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let installmentRepository: { listByInvoice: jest.Mock; save: jest.Mock };
  let allocationService: { resolveAllocations: jest.Mock };
  let studentCreditService: {
    issue: jest.Mock;
    consume: jest.Mock;
    netOutIssuedCredit: jest.Mock;
    getBalanceForUpdate: jest.Mock;
    getBalance: jest.Mock;
    getOrCreate: jest.Mock;
  };
  let documentVerificationService: { mint: jest.Mock; findByDocument: jest.Mock; verify: jest.Mock };
  let service: ReceiptsService;

  beforeEach(() => {
    receiptRepository = {
      findByIdempotencyKey: jest.fn(async () => null),
      create: jest.fn(async (data) => makeReceipt(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeReceipt({})),
    };
    splitRepository = { create: jest.fn(async (data) => makeSplit(data)), listByReceipt: jest.fn(async () => []) };
    allocationRepository = { create: jest.fn(async (data) => makeAllocation(data)), listByReceipt: jest.fn(async () => []) };
    chequeRepository = { create: jest.fn(async (data) => ({ id: "cheque-1", ...data })) };
    sessionRepository = { findByIdOrFail: jest.fn(async () => makeSession({})) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [
        { id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain },
      ]),
      findByCode: jest.fn(async (code: string) => ({ id: `acc-code-${code}`, code, isActive: true, isPostable: true })),
    };
    postingService = {
      post: jest.fn(async () => ({ id: "journal-1", lines: [] })),
      reverse: jest.fn(async () => ({ id: "reversal-journal-1", lines: [] })),
    };
    numberingService = { allocate: jest.fn(async (_em, docType: string) => (docType === "RVS_PAY_RECEIPT" ? "RVS-000001" : "PAY-000001")) };
    studentLedgerService = { appendEntry: jest.fn(async () => undefined) };
    ledgerEntryRepository = { getStatementWithRunningBalance: jest.fn(async () => []) };
    studentRepository = { findByIdOrFail: jest.fn(async () => ({ id: "student-1" })) };
    invoiceRepository = { findByIdOrFail: jest.fn(async () => makeInvoice({})), save: jest.fn(async (e) => e) };
    installmentRepository = { listByInvoice: jest.fn(async () => []), save: jest.fn(async (e) => e) };
    allocationService = {
      resolveAllocations: jest.fn(async () => [{ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }]),
    };
    studentCreditService = {
      issue: jest.fn(async () => ({ id: "credit-entry-1" })),
      consume: jest.fn(async () => ({ id: "credit-entry-2" })),
      netOutIssuedCredit: jest.fn(async () => ({ id: "credit-entry-3" })),
      getBalanceForUpdate: jest.fn(async () => Money.ZERO),
      getBalance: jest.fn(async () => Money.ZERO),
      getOrCreate: jest.fn(async () => ({ id: "credit-1", studentId: "student-1", balance: Money.ZERO })),
    };
    documentVerificationService = {
      mint: jest.fn(async () => ({ token: "docv-token-1" })),
      findByDocument: jest.fn(async () => null),
      verify: jest.fn(async () => null),
    };

    service = new ReceiptsService(
      receiptRepository as never,
      splitRepository as never,
      allocationRepository as never,
      chequeRepository as never,
      sessionRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      studentLedgerService as never,
      ledgerEntryRepository as never,
      studentRepository as never,
      invoiceRepository as never,
      installmentRepository as never,
      allocationService as never,
      studentCreditService as never,
      documentVerificationService as never,
    );
  });

  const baseInput = {
    studentId: "student-1",
    payerName: "John Doe",
    receiptDate: "2026-07-15",
    total: Money.fromInt(1000),
    cashierId: "cashier-1",
    sessionId: "session-1",
  };

  describe("captureReceipt — validation", () => {
    it("rejects when splits do not sum to the declared total (BR-PAY-01)", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CASH", amount: Money.fromInt(900) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an empty splits array", async () => {
      await expect(service.captureReceipt(EM, { ...baseInput, splits: [] })).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a WALLET split (Module 11 not built — out of scope this pass)", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "WALLET", amount: Money.fromInt(1000) }] }),
      ).rejects.toThrow(/not yet supported/i);
      expect(postingService.post).not.toHaveBeenCalled();
    });

    it("rejects a CASH split with no sessionId (BR-PAY-04)", async () => {
      await expect(
        service.captureReceipt(EM, {
          ...baseInput,
          sessionId: undefined,
          splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a CASH split against a non-OPEN session (BR-PAY-04)", async () => {
      sessionRepository.findByIdOrFail.mockResolvedValueOnce(makeSession({ status: "CLOSED" }));
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CASH", amount: Money.fromInt(1000) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a CASH split against a session belonging to a different cashier (BR-PAY-04)", async () => {
      sessionRepository.findByIdOrFail.mockResolvedValueOnce(makeSession({ cashierId: "other-cashier" }));
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CASH", amount: Money.fromInt(1000) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a BANK split missing bankAccountId/externalRef", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "BANK", amount: Money.fromInt(1000) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a CARD split missing externalRef (terminal reference)", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CARD", amount: Money.fromInt(1000) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a CHEQUE split missing chequeDetails", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CHEQUE", amount: Money.fromInt(1000) }] }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("captureReceipt — idempotency", () => {
    it("replays an existing receipt unchanged, with no second effect", async () => {
      const existing = makeReceipt({ idempotencyKey: "idem-1" });
      receiptRepository.findByIdempotencyKey.mockResolvedValueOnce(existing);

      const result = await service.captureReceipt(EM, {
        ...baseInput,
        idempotencyKey: "idem-1",
        splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
      });

      expect(result).toBe(existing);
      expect(postingService.post).not.toHaveBeenCalled();
      expect(receiptRepository.create).not.toHaveBeenCalled();
      expect(numberingService.allocate).not.toHaveBeenCalled();
    });
  });

  describe("captureReceipt — plain full-allocation receipt", () => {
    it("posts P-08 (clearing debit / AR-Student credit) and updates the invoice to PAID", async () => {
      const receipt = await service.captureReceipt(EM, {
        ...baseInput,
        splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
      });

      expect(receipt.number).toBe("PAY-000001");
      expect(receipt.status).toBe("POSTED");
      expect(receipt.journalId).toBe("journal-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: "acc-code-1010", debit: Money.fromInt(1000), credit: Money.ZERO }),
          expect.objectContaining({ accountId: "acc-AR_STUDENT", debit: Money.ZERO, credit: Money.fromInt(1000) }),
        ]),
      );
      expect(draft.lines).toHaveLength(2);
      // No prepayment control account looked up — nothing goes to prepayment in this scenario.
      expect(glAccountRepository.findByControlDomain).not.toHaveBeenCalledWith("PREPAYMENT", expect.anything());

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: Money.fromInt(1000), balance: Money.ZERO, status: "PAID" }),
        EM,
      );
      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ debit: Money.ZERO, credit: Money.fromInt(1000) }),
      );

      // Phase 6 Slice 12 (Part D) — no overpayment in this scenario, so no Credit Balance entry is issued.
      expect(studentCreditService.issue).not.toHaveBeenCalled();
    });

    it("increments bill_installment.settled_amount oldest-seq-first for the allocated invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ balance: Money.fromInt(1000), paidAmount: Money.ZERO }),
      );
      installmentRepository.listByInvoice.mockResolvedValueOnce([
        makeInstallment({ id: "inst-1", seq: 1, amount: Money.fromInt(600), settledAmount: Money.ZERO }),
        makeInstallment({ id: "inst-2", seq: 2, amount: Money.fromInt(400), settledAmount: Money.ZERO }),
      ]);

      await service.captureReceipt(EM, { ...baseInput, splits: [{ method: "CASH", amount: Money.fromInt(1000) }] });

      expect(installmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inst-1", settledAmount: Money.fromInt(600) }),
        EM,
      );
      expect(installmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inst-2", settledAmount: Money.fromInt(400) }),
        EM,
      );
    });
  });

  describe("captureReceipt — verification token minting (Phase 6 Slice 16 Part 1)", () => {
    it("mints a docv_record token via the caller's EntityManager, after the receipt itself is inserted", async () => {
      const receipt = await service.captureReceipt(EM, {
        ...baseInput,
        splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
      });

      expect(documentVerificationService.mint).toHaveBeenCalledWith(EM, {
        documentType: "PAYMENT_RECEIPT",
        documentId: receipt.id,
        documentRef: receipt.number,
        summary: {
          payerName: receipt.payerName,
          total: receipt.total.toDecimalString(),
          receiptDate: receipt.receiptDate,
          receiptNumber: receipt.number,
        },
      });
    });

    it("does not fail captureReceipt() if mint() is never reached before an earlier validation error", async () => {
      await expect(
        service.captureReceipt(EM, { ...baseInput, splits: [] }),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(documentVerificationService.mint).not.toHaveBeenCalled();
    });
  });

  describe("captureReceipt — invoiceIds plumbing (Phase 6 Slice 8 Part 3, 'Collect Fees')", () => {
    it("forwards input.invoiceIds to AllocationService.resolveAllocations() unchanged", async () => {
      await service.captureReceipt(EM, {
        ...baseInput,
        splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
        invoiceIds: ["invoice-a", "invoice-b"],
      });

      expect(allocationService.resolveAllocations).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ studentId: "student-1", invoiceIds: ["invoice-a", "invoice-b"] }),
      );
    });

    it("omitting invoiceIds forwards undefined — the exact same call shape every pre-existing caller (cheques/suspense/mpesa/bulk-allocation/plain capture) already makes", async () => {
      await service.captureReceipt(EM, {
        ...baseInput,
        splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
      });

      expect(allocationService.resolveAllocations).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ studentId: "student-1", amount: Money.fromInt(1000), invoiceIds: undefined }),
      );
    });
  });

  describe("captureReceipt — surplus to prepayment (P-08 + P-09)", () => {
    it("posts both AR-Student credit and prepayment credit, BR-PAY-03 fully accounted", async () => {
      allocationService.resolveAllocations.mockResolvedValueOnce([
        { invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false },
        { amount: Money.fromInt(500), toPrepayment: true },
      ]);

      await service.captureReceipt(EM, {
        ...baseInput,
        total: Money.fromInt(1500),
        splits: [{ method: "CASH", amount: Money.fromInt(1500) }],
      });

      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: "acc-code-1010", debit: Money.fromInt(1500), credit: Money.ZERO }),
          expect.objectContaining({ accountId: "acc-AR_STUDENT", debit: Money.ZERO, credit: Money.fromInt(1000) }),
          expect.objectContaining({ accountId: "acc-PREPAYMENT", debit: Money.ZERO, credit: Money.fromInt(500) }),
        ]),
      );

      // BR-PAY-03: every pay_receipt_allocation row's amount sums to exactly the receipt total.
      const allocationAmounts = allocationRepository.create.mock.calls.map(
        (call) => (call[0] as { amount: Money }).amount,
      );
      const sum = allocationAmounts.reduce((acc: Money, amount: Money) => acc.add(amount), Money.ZERO);
      expect(sum.equals(Money.fromInt(1500))).toBe(true);
    });

    it("Phase 6 Slice 12 (Part D) — also issues a real Credit Balance entry for exactly the prepayment amount, with the receipt's own id", async () => {
      allocationService.resolveAllocations.mockResolvedValueOnce([
        { invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false },
        { amount: Money.fromInt(500), toPrepayment: true },
      ]);

      await service.captureReceipt(EM, {
        ...baseInput,
        total: Money.fromInt(1500),
        splits: [{ method: "CASH", amount: Money.fromInt(1500) }],
      });

      expect(studentCreditService.issue).toHaveBeenCalledTimes(1);
      expect(studentCreditService.issue).toHaveBeenCalledWith(
        EM,
        "student-1",
        Money.fromInt(500),
        expect.objectContaining({ actorId: "cashier-1" }),
      );
      // The receiptId passed through is the SAME id the P-08/P-09 journal itself was posted against.
      const issuedReceiptId = studentCreditService.issue.mock.calls[0][3].receiptId;
      expect(typeof issuedReceiptId).toBe("string");
      expect(issuedReceiptId.length).toBeGreaterThan(0);
    });
  });

  describe("captureReceipt — mixed CASH + MPESA_STK split", () => {
    it("aggregates clearing debits per distinct clearing account", async () => {
      await service.captureReceipt(EM, {
        ...baseInput,
        splits: [
          { method: "CASH", amount: Money.fromInt(600) },
          { method: "MPESA_STK", amount: Money.fromInt(400), mpesaTransactionId: "mpesa-txn-1" },
        ],
      });

      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: "acc-code-1010", debit: Money.fromInt(600), credit: Money.ZERO }),
          expect.objectContaining({ accountId: "acc-MPESA_CLEARING", debit: Money.fromInt(400), credit: Money.ZERO }),
        ]),
      );
      expect(splitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: "MPESA_STK", mpesaTransactionId: "mpesa-txn-1" }),
        EM,
      );
    });
  });

  describe("captureReceipt — cheque split", () => {
    it("creates an UNCLEARED pay_cheque row and links it on the split", async () => {
      await service.captureReceipt(EM, {
        ...baseInput,
        sessionId: undefined,
        splits: [
          {
            method: "CHEQUE",
            amount: Money.fromInt(1000),
            chequeDetails: { bankName: "KCB", chequeNo: "000123", chequeDate: "2026-07-01", drawer: "Jane Doe" },
          },
        ],
      });

      expect(chequeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ bankName: "KCB", chequeNo: "000123", status: "UNCLEARED", amount: Money.fromInt(1000) }),
        EM,
      );
      expect(splitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: "CHEQUE", chequeId: "cheque-1" }),
        EM,
      );
    });
  });

  describe("recordWalletFundedReceipt (Phase 6 Slice 12 Part A)", () => {
    it("creates a receipt with journalId null, exactly one WALLET split, and allocation rows summing to the total (BR-PAY-01/03 trigger-satisfying)", async () => {
      const receipt = await service.recordWalletFundedReceipt(EM, {
        studentId: "student-1",
        payerName: "Jane Doe",
        receiptDate: "2026-08-05",
        allocations: [
          { invoiceId: "invoice-1", amount: Money.fromInt(3000) },
          { invoiceId: "invoice-2", amount: Money.fromInt(2000) },
        ],
        cashierId: "cashier-1",
        walletTransactionId: "wall-txn-1",
      });

      expect(receipt.journalId).toBeNull();
      expect(receipt.status).toBe("POSTED");
      expect(receipt.total.equals(Money.fromInt(5000))).toBe(true);
      expect(receipt.number).toBe("PAY-000001");
      // No second GL posting — the caller already posted the wallet's own journal.
      expect(postingService.post).not.toHaveBeenCalled();

      // Exactly one WALLET split, amount = total.
      expect(splitRepository.create).toHaveBeenCalledTimes(1);
      expect(splitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: "WALLET", amount: Money.fromInt(5000) }),
        EM,
      );

      // Allocation rows: one per invoice, toPrepayment:false, summing to exactly the receipt total.
      expect(allocationRepository.create).toHaveBeenCalledTimes(2);
      const allocationAmounts = allocationRepository.create.mock.calls.map((call) => (call[0] as { amount: Money }).amount);
      const allocationSum = allocationAmounts.reduce((sum: Money, amount: Money) => sum.add(amount), Money.ZERO);
      expect(allocationSum.equals(receipt.total)).toBe(true);
      expect(allocationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: "invoice-1", amount: Money.fromInt(3000), toPrepayment: false }),
        EM,
      );
      expect(allocationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: "invoice-2", amount: Money.fromInt(2000), toPrepayment: false }),
        EM,
      );

      // Mirrors captureReceipt()'s own student-ledger append convention.
      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ studentId: "student-1", debit: Money.ZERO, credit: Money.fromInt(5000) }),
      );

      // Does NOT touch bill_invoice/bill_installment — the caller already applied these.
      expect(invoiceRepository.save).not.toHaveBeenCalled();
      expect(installmentRepository.save).not.toHaveBeenCalled();
    });

    it("rejects an empty allocations array", async () => {
      await expect(
        service.recordWalletFundedReceipt(EM, {
          studentId: "student-1",
          payerName: "Jane Doe",
          receiptDate: "2026-08-05",
          allocations: [],
          cashierId: "cashier-1",
          walletTransactionId: "wall-txn-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive allocation amount", async () => {
      await expect(
        service.recordWalletFundedReceipt(EM, {
          studentId: "student-1",
          payerName: "Jane Doe",
          receiptDate: "2026-08-05",
          allocations: [{ invoiceId: "invoice-1", amount: Money.ZERO }],
          cashierId: "cashier-1",
          walletTransactionId: "wall-txn-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("reverseReceipt", () => {
    it("rejects reversing a non-POSTED receipt", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(makeReceipt({ status: "REVERSED" }));
      await expect(service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects reversing a receipt with a WALLET split (Phase 6 Slice 12 Part A — the financial-correctness guard this pass exists to add)", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(makeReceipt({ id: "receipt-1", journalId: null, total: Money.fromInt(1000) }));
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "WALLET", amount: Money.fromInt(1000) })]);

      await expect(service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1")).rejects.toThrow(
        /can't be reversed here/,
      );
      // No GL reversal, no contra receipt, no allocation unwind — rejected before any of that runs.
      expect(postingService.reverse).not.toHaveBeenCalled();
      expect(receiptRepository.create).not.toHaveBeenCalled();
    });

    it("rejects reversing a receipt with a CREDIT_BALANCE split (Phase 6 Slice 12 Part D — same guard, now real for CREDIT_BALANCE too)", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1000) }));
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CREDIT_BALANCE", amount: Money.fromInt(1000) })]);

      await expect(service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1")).rejects.toThrow(
        /can't be reversed here/,
      );
      expect(postingService.reverse).not.toHaveBeenCalled();
      expect(receiptRepository.create).not.toHaveBeenCalled();
      // The netting-out path must not run either — this receipt is blocked by the earlier guard, never reaches it.
      expect(studentCreditService.netOutIssuedCredit).not.toHaveBeenCalled();
    });

    it("Phase 6 Slice 12 (Part D) — nets out the Credit Balance an ordinary CASH receipt issued as an overpayment, BEFORE the allocation unwind/GL reverse", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(
        makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1500), number: "PAY-000001" }),
      );
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CASH", amount: Money.fromInt(1500) })]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([
        makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }),
        makeAllocation({ invoiceId: null, amount: Money.fromInt(500), toPrepayment: true }),
      ]);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ paidAmount: Money.fromInt(1000), balance: Money.ZERO, status: "PAID" }),
      );

      const callOrder: string[] = [];
      studentCreditService.netOutIssuedCredit.mockImplementationOnce(async () => {
        callOrder.push("netOut");
        return { id: "credit-entry-1" };
      });
      postingService.reverse.mockImplementationOnce(async () => {
        callOrder.push("glReverse");
        return { id: "reversal-journal-1", lines: [] };
      });

      await service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1");

      expect(studentCreditService.netOutIssuedCredit).toHaveBeenCalledWith(
        EM,
        "student-1",
        Money.fromInt(500),
        expect.objectContaining({ receiptId: "receipt-1", actorId: "supervisor-1" }),
      );
      // The netting-out check ran BEFORE the GL reverse — not after.
      expect(callOrder).toEqual(["netOut", "glReverse"]);
    });

    it("Phase 6 Slice 12 (Part D) — aborts the WHOLE reversal, before any mutation, when the credit was already partially consumed elsewhere", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(
        makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1500) }),
      );
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CASH", amount: Money.fromInt(1500) })]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([
        makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }),
        makeAllocation({ invoiceId: null, amount: Money.fromInt(500), toPrepayment: true }),
      ]);
      studentCreditService.netOutIssuedCredit.mockRejectedValueOnce(
        new ValidationException(
          "Cannot reverse this receipt — KES 500.0000 of the credit balance it created has already been applied to other invoices. Contact an administrator for a manual correction.",
        ),
      );

      await expect(service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1")).rejects.toThrow(
        /already been applied to other invoices/,
      );

      // Nothing else ran — the whole reversal aborted before any other mutation.
      expect(invoiceRepository.save).not.toHaveBeenCalled();
      expect(postingService.reverse).not.toHaveBeenCalled();
      expect(receiptRepository.create).not.toHaveBeenCalled();
      expect(receiptRepository.save).not.toHaveBeenCalled();
    });

    it("still reverses an ordinary CASH-method receipt completely normally (regression check — the guard must not over-match)", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(
        makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1000), number: "PAY-000001" }),
      );
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CASH", amount: Money.fromInt(1000) })]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([
        makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }),
      ]);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ paidAmount: Money.fromInt(1000), balance: Money.ZERO, status: "PAID" }),
      );

      const contra = await service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1");

      expect(contra.status).toBe("POSTED");
      expect(contra.reversalOfId).toBe("receipt-1");
      expect(postingService.reverse).toHaveBeenCalledWith(EM, "journal-1", expect.stringContaining("ERROR"), "supervisor-1");
    });

    it("unwinds the invoice allocation, reverses the GL, and generates an RVS- contra receipt", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(
        makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1000), number: "PAY-000001" }),
      );
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CASH", amount: Money.fromInt(1000) })]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([
        makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }),
      ]);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ paidAmount: Money.fromInt(1000), balance: Money.ZERO, status: "PAID" }),
      );

      const contra = await service.reverseReceipt(EM, "receipt-1", "ERROR", "approval-1", "supervisor-1");

      expect(postingService.reverse).toHaveBeenCalledWith(EM, "journal-1", expect.stringContaining("ERROR"), "supervisor-1");

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: Money.ZERO, balance: Money.fromInt(1000), status: "POSTED" }),
        EM,
      );

      expect(contra.number).toBe("RVS-000001");
      expect(contra.reversalOfId).toBe("receipt-1");
      expect(contra.status).toBe("POSTED");
      expect(contra.journalId).toBe("reversal-journal-1");

      expect(receiptRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "REVERSED", reversalReason: "ERROR", approvalRef: "approval-1" }),
        EM,
      );

      expect(splitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ receiptId: contra.id, method: "CASH", amount: Money.fromInt(1000) }),
        EM,
      );
      expect(allocationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ receiptId: contra.id, invoiceId: "invoice-1", amount: Money.fromInt(1000) }),
        EM,
      );
      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({ debit: Money.fromInt(1000), credit: Money.ZERO }),
      );
    });

    it("unwinds bill_installment.settled_amount in reverse-seq order", async () => {
      receiptRepository.findByIdOrFail.mockResolvedValueOnce(
        makeReceipt({ id: "receipt-1", journalId: "journal-1", total: Money.fromInt(1000) }),
      );
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ amount: Money.fromInt(1000) })]);
      allocationRepository.listByReceipt.mockResolvedValueOnce([
        makeAllocation({ invoiceId: "invoice-1", amount: Money.fromInt(1000), toPrepayment: false }),
      ]);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ paidAmount: Money.fromInt(1000), balance: Money.ZERO, status: "PAID" }),
      );
      installmentRepository.listByInvoice.mockResolvedValueOnce([
        makeInstallment({ id: "inst-1", seq: 1, amount: Money.fromInt(600), settledAmount: Money.fromInt(600) }),
        makeInstallment({ id: "inst-2", seq: 2, amount: Money.fromInt(400), settledAmount: Money.fromInt(400) }),
      ]);

      await service.reverseReceipt(EM, "receipt-1", "DUPLICATE", "approval-1", "supervisor-1");

      expect(installmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inst-2", settledAmount: Money.ZERO }),
        EM,
      );
      expect(installmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inst-1", settledAmount: Money.ZERO }),
        EM,
      );
    });
  });

  describe("applyStudentCreditToInvoices (Phase 6 Slice 12 Part D)", () => {
    it("stops mid-list when the credit balance runs out, reporting a real shortfall for the untouched remainder", async () => {
      studentCreditService.getBalanceForUpdate.mockResolvedValueOnce(Money.fromInt(3000));
      // id-keyed lookup, not a plain call-count queue — applyInvoiceAllocation()
      // (the shared private helper, reused unmodified from captureReceipt()'s
      // own step 9) independently RE-fetches each invoice by id internally, so
      // a naive mockResolvedValueOnce/mockResolvedValueOnce queue would hand
      // invoice-2's data back to invoice-1's second (internal) fetch — the
      // exact same id-keyed-map fix `sweepToInvoices()`'s own Part A Jest spec
      // already established for this identical double-fetch shape.
      const invoicesById: Record<string, ReturnType<typeof makeInvoice>> = {
        "invoice-1": makeInvoice({ id: "invoice-1", studentId: "student-1", balance: Money.fromInt(2000) }),
        "invoice-2": makeInvoice({ id: "invoice-2", studentId: "student-1", balance: Money.fromInt(4000) }),
      };
      invoiceRepository.findByIdOrFail.mockImplementation(async (id: string) => invoicesById[id]);

      const result = await service.applyStudentCreditToInvoices(
        EM,
        { studentId: "student-1", invoiceIds: ["invoice-1", "invoice-2"] },
        "actor-1",
      );

      expect(result.totalApplied.equals(Money.fromInt(3000))).toBe(true);
      expect(result.allocations).toEqual([
        { invoiceId: "invoice-1", amount: Money.fromInt(2000) },
        { invoiceId: "invoice-2", amount: Money.fromInt(1000) },
      ]);
      // invoice-2 only got 1000 of its real 4000 balance — 3000 remains, NOT the naively-wrong
      // "4000 - 1000 already-decremented-in-place" style bug Part A's own sweepToInvoices() caught.
      expect(result.shortfall).toEqual([{ invoiceId: "invoice-2", remainingBalance: Money.fromInt(3000) }]);
      expect(result.receiptId).not.toBeNull();

      // ONE real new P-10 GL journal — debit PREPAYMENT, credit AR_STUDENT, for the TOTAL applied.
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: "acc-PREPAYMENT", debit: Money.fromInt(3000), credit: Money.ZERO }),
          expect.objectContaining({ accountId: "acc-AR_STUDENT", debit: Money.ZERO, credit: Money.fromInt(3000) }),
        ]),
      );
      expect(draft.lines).toHaveLength(2);

      // Exactly ONE CREDIT_BALANCE split, real (non-null) journalId — a genuinely new posting.
      expect(splitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: "CREDIT_BALANCE", amount: Money.fromInt(3000) }),
        EM,
      );

      // ONE aggregate consume() call for the total — not one per invoice.
      expect(studentCreditService.consume).toHaveBeenCalledTimes(1);
      expect(studentCreditService.consume).toHaveBeenCalledWith(
        EM,
        "student-1",
        Money.fromInt(3000),
        expect.objectContaining({ invoiceId: null, actorId: "actor-1" }),
      );
    });

    it("rejects an empty invoiceIds array", async () => {
      await expect(
        service.applyStudentCreditToInvoices(EM, { studentId: "student-1", invoiceIds: [] }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("returns a clean zero result — no journal/receipt/consume — when the student has no credit balance", async () => {
      studentCreditService.getBalanceForUpdate.mockResolvedValueOnce(Money.ZERO);
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(makeInvoice({ id: "invoice-1", studentId: "student-1", balance: Money.fromInt(500) }));

      const result = await service.applyStudentCreditToInvoices(EM, { studentId: "student-1", invoiceIds: ["invoice-1"] }, "actor-1");

      expect(result).toEqual({
        totalApplied: Money.ZERO,
        allocations: [],
        receiptId: null,
        shortfall: [{ invoiceId: "invoice-1", remainingBalance: Money.fromInt(500) }],
      });
      expect(postingService.post).not.toHaveBeenCalled();
      expect(studentCreditService.consume).not.toHaveBeenCalled();
    });

    it("rejects when a given invoice belongs to a different student", async () => {
      studentCreditService.getBalanceForUpdate.mockResolvedValueOnce(Money.fromInt(1000));
      invoiceRepository.findByIdOrFail.mockResolvedValueOnce(
        makeInvoice({ id: "invoice-1", studentId: "some-other-student", balance: Money.fromInt(500) }),
      );

      await expect(
        service.applyStudentCreditToInvoices(EM, { studentId: "student-1", invoiceIds: ["invoice-1"] }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
