import { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity } from "../../../accounting";
import { WalletTransactionsService } from "../application/wallet-transactions.service";
import { WallWalletEntity } from "../domain/wall-wallet.entity";
import { WallServicePointEntity } from "../domain/wall-service-point.entity";
import { WallTransactionEntity } from "../domain/wall-transaction.entity";
import { StdGuardianEntity } from "../../students/domain/std-guardian.entity";
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";
import { BillInstallmentEntity } from "../../billing/domain/bill-installment.entity";

const EM = {} as EntityManager;

function makeWallet(overrides: Partial<WallWalletEntity>): WallWalletEntity {
  return {
    id: "wallet-1",
    studentId: "student-1",
    status: "ACTIVE",
    balance: Money.ZERO,
    overdraftLimit: Money.ZERO,
    dailyLimit: null,
    txnLimit: null,
    categoryBlocks: [],
    statusReason: null,
    ...overrides,
  } as WallWalletEntity;
}

function makeServicePoint(overrides: Partial<WallServicePointEntity>): WallServicePointEntity {
  return {
    id: "sp-1",
    name: "School Shop",
    type: "SHOP",
    glIncomeAccountId: "income-acct",
    isActive: true,
    perTxnLimit: null,
    ...overrides,
  } as WallServicePointEntity;
}

function makeAccount(id: string, code: string, controlDomain: string | null = null): GlAccountEntity {
  return { id, code, name: code, isActive: true, isPostable: true, controlDomain } as GlAccountEntity;
}

function makeGuardian(overrides: Partial<StdGuardianEntity>): StdGuardianEntity {
  return {
    id: "guardian-1",
    fullName: "Jane Doe",
    phone: "0700000000",
    payoutVerified: { CASH: true },
    ...overrides,
  } as StdGuardianEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    studentId: "student-1",
    status: "POSTED",
    total: Money.fromInt(1000),
    paidAmount: Money.ZERO,
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

describe("WalletTransactionsService", () => {
  let walletRepository: { findByIdForUpdate: jest.Mock; save: jest.Mock; listAll: jest.Mock };
  let transactionRepository: {
    findByIdempotencyKey: jest.Mock;
    create: jest.Mock;
    sumSpendToday: jest.Mock;
    listByJournalId: jest.Mock;
    listByWallet: jest.Mock;
    updateReceiptId: jest.Mock;
  };
  let servicePointRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let guardianRepository: { findByIdOrFail: jest.Mock };
  let invoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let installmentRepository: { listByInvoice: jest.Mock; save: jest.Mock };
  let integrityRunRepository: { create: jest.Mock; findLatest: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let dataSource: { query: jest.Mock };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let receiptsService: { recordWalletFundedReceipt: jest.Mock };
  let service: WalletTransactionsService;

  const walletAccount = makeAccount("acct-wallet", "2030", "WALLET");
  const arStudentAccount = makeAccount("acct-ar", "1100", "AR_STUDENT");
  const mpesaAccount = makeAccount("acct-mpesa", "1400", "MPESA_CLEARING");
  const cashAccount = makeAccount("acct-cash", "1010");
  const bankAccount = makeAccount("acct-bank", "1020");
  const contraAccount = makeAccount("acct-contra", "5090");

  beforeEach(() => {
    walletRepository = {
      findByIdForUpdate: jest.fn(async (_em: unknown, id: string) => makeWallet({ id })),
      save: jest.fn(async (e: WallWalletEntity) => e),
      listAll: jest.fn(async () => []),
    };
    transactionRepository = {
      findByIdempotencyKey: jest.fn(async () => null),
      create: jest.fn(async (data: Partial<WallTransactionEntity>) => ({ ...data }) as WallTransactionEntity),
      sumSpendToday: jest.fn(async () => Money.ZERO),
      listByJournalId: jest.fn(async () => []),
      listByWallet: jest.fn(async () => []),
      updateReceiptId: jest.fn(async () => undefined),
    };
    servicePointRepository = { findByIdOrFail: jest.fn(async () => makeServicePoint({})) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => {
        if (domain === "WALLET") return [walletAccount];
        if (domain === "AR_STUDENT") return [arStudentAccount];
        if (domain === "MPESA_CLEARING") return [mpesaAccount];
        return [];
      }),
      findByCode: jest.fn(async (code: string) => {
        const map: Record<string, GlAccountEntity> = { "1010": cashAccount, "1020": bankAccount, "5090": contraAccount };
        return map[code] ?? null;
      }),
    };
    postingService = { post: jest.fn(async (_em: unknown, draft: Record<string, unknown>) => ({ id: "journal-1", lines: draft.lines })) };
    settingsService = { getTyped: jest.fn(async (_key: string, def: unknown) => def) };
    guardianRepository = { findByIdOrFail: jest.fn(async () => makeGuardian({})) };
    invoiceRepository = { findByIdOrFail: jest.fn(async () => makeInvoice({})), save: jest.fn(async (e: BillInvoiceEntity) => e) };
    installmentRepository = {
      listByInvoice: jest.fn(async () => [] as BillInstallmentEntity[]),
      save: jest.fn(async (e: BillInstallmentEntity) => e),
    };
    integrityRunRepository = { create: jest.fn(async (data: Record<string, unknown>) => data), findLatest: jest.fn(async () => null) };
    outboxWriter = { write: jest.fn(async () => undefined) };
    dataSource = { query: jest.fn(async () => [{ balance: "0" }]) };
    studentRepository = { findByIdOrFail: jest.fn(async () => ({ id: "student-1", firstName: "Jane", lastName: "Doe" })) };
    receiptsService = {
      recordWalletFundedReceipt: jest.fn(async (_em: unknown, input: Record<string, unknown>) => ({ id: "receipt-1", ...input })),
    };

    service = new WalletTransactionsService(
      walletRepository as never,
      transactionRepository as never,
      servicePointRepository as never,
      glAccountRepository as never,
      postingService as never,
      settingsService as never,
      guardianRepository as never,
      invoiceRepository as never,
      installmentRepository as never,
      integrityRunRepository as never,
      outboxWriter as never,
      dataSource as never,
      studentRepository as never,
      receiptsService as never,
    );
  });

  describe("topUp", () => {
    it("posts P-13: debits the clearing account, credits the WALLET control account", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(100) }));
      const txn = await service.topUp(EM, { walletId: "wallet-1", amount: Money.fromInt(500), method: "CASH" }, "actor-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: cashAccount.id, debit: Money.fromInt(500), credit: Money.ZERO }),
        expect.objectContaining({ accountId: walletAccount.id, debit: Money.ZERO, credit: Money.fromInt(500) }),
      ]);
      expect(txn.type).toBe("TOPUP");
      expect(txn.direction).toBe("C");
      expect(walletRepository.save).toHaveBeenCalled();
    });

    it("is idempotent on a repeated idempotencyKey", async () => {
      const existing = { id: "existing-txn" } as WallTransactionEntity;
      transactionRepository.findByIdempotencyKey.mockResolvedValue(existing);
      const result = await service.topUp(EM, { walletId: "wallet-1", amount: Money.fromInt(500), method: "CASH", idempotencyKey: "key-1" }, "actor-1");
      expect(result).toBe(existing);
      expect(walletRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });
  });

  describe("spend", () => {
    const baseWallet = () => makeWallet({ balance: Money.fromInt(1000) });

    it("posts P-14: debits WALLET, credits the service point's income account", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(baseWallet());
      const txn = await service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(200), servicePointId: "sp-1" }, "actor-1");

      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: walletAccount.id, debit: Money.fromInt(200), credit: Money.ZERO }),
        expect.objectContaining({ accountId: "income-acct", debit: Money.ZERO, credit: Money.fromInt(200) }),
      ]);
      expect(txn.type).toBe("SPEND");
      expect(txn.direction).toBe("D");
    });

    it("rejects when wallet is not ACTIVE (BR-WALL-03)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ status: "LOCKED", balance: Money.fromInt(1000) }));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        ValidationException,
      );
    });

    it("rejects when the daily SPEND limit would be exceeded (BR-WALL-02)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000), dailyLimit: Money.fromInt(300) }));
      transactionRepository.sumSpendToday.mockResolvedValue(Money.fromInt(250));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        /BR-WALL-02/,
      );
    });

    it("rejects when amount exceeds the applicable per-transaction limit (wallet.txn_limit)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000), txnLimit: Money.fromInt(50) }));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        /BR-WALL-02/,
      );
    });

    it("rejects when amount exceeds the service point's per_txn_limit (stricter than wallet.txn_limit)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000), txnLimit: Money.fromInt(500) }));
      servicePointRepository.findByIdOrFail.mockResolvedValue(makeServicePoint({ perTxnLimit: Money.fromInt(50) }));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        /BR-WALL-02/,
      );
    });

    it("rejects a blocked category (BR-WALL-03)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000), categoryBlocks: ["SHOP"] }));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        /BR-WALL-03/,
      );
    });

    it("rejects a spend that would breach the balance floor (BR-WALL-01)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(50), overdraftLimit: Money.ZERO }));
      await expect(service.spend(EM, { walletId: "wallet-1", amount: Money.fromInt(100), servicePointId: "sp-1" }, "actor-1")).rejects.toThrow(
        /BR-WALL-01/,
      );
    });
  });

  describe("transferToFees", () => {
    it("posts P-15 (debit WALLET / credit AR_STUDENT), applies the invoice allocation, and now ALSO produces a real wallet-funded receipt (Phase 6 Slice 12 Part A)", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000), studentId: "student-1" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ id: "invoice-1", balance: Money.fromInt(1000) }));

      const txn = await service.transferToFees(EM, { walletId: "wallet-1", amount: Money.fromInt(800), invoiceId: "invoice-1" }, "actor-1");

      // Pre-existing behavior, unchanged: one balanced P-15 journal, invoice allocation applied.
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: walletAccount.id, debit: Money.fromInt(800), credit: Money.ZERO }),
        expect.objectContaining({ accountId: arStudentAccount.id, debit: Money.ZERO, credit: Money.fromInt(800) }),
      ]);
      expect(txn.type).toBe("FEE_TRANSFER");
      expect(txn.direction).toBe("D");
      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: Money.fromInt(800), balance: Money.fromInt(200), status: "PARTIALLY_PAID" }),
        EM,
      );

      // New this pass: a real wallet-funded receipt, cross-referenced back onto the transaction.
      expect(receiptsService.recordWalletFundedReceipt).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({
          studentId: "student-1",
          payerName: "Jane Doe",
          allocations: [{ invoiceId: "invoice-1", amount: Money.fromInt(800) }],
          walletTransactionId: txn.id,
        }),
      );
      expect(transactionRepository.updateReceiptId).toHaveBeenCalledWith(txn.id, "receipt-1", EM);
      expect(txn.receiptId).toBe("receipt-1");
    });

    it("requires an approvalRef above the transfer threshold (pre-existing behavior, unchanged)", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) => (key.includes("threshold") ? "500.00" : def));
      await expect(
        service.transferToFees(EM, { walletId: "wallet-1", amount: Money.fromInt(1000), invoiceId: "invoice-1" }, "actor-1"),
      ).rejects.toThrow(/FR-WALL-013.1/);
      expect(receiptsService.recordWalletFundedReceipt).not.toHaveBeenCalled();
    });

    it("is idempotent on a repeated idempotencyKey — no second journal or receipt (pre-existing behavior, unchanged)", async () => {
      const existing = { id: "existing-txn" } as WallTransactionEntity;
      transactionRepository.findByIdempotencyKey.mockResolvedValue(existing);
      const result = await service.transferToFees(
        EM,
        { walletId: "wallet-1", amount: Money.fromInt(800), invoiceId: "invoice-1", idempotencyKey: "key-1" },
        "actor-1",
      );
      expect(result).toBe(existing);
      expect(postingService.post).not.toHaveBeenCalled();
      expect(receiptsService.recordWalletFundedReceipt).not.toHaveBeenCalled();
    });
  });

  describe("sweepToInvoices (Phase 6 Slice 12 Part A)", () => {
    it("stops mid-list once the wallet runs out, applying a partial amount to the last invoice reached, in ONE aggregated journal", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(5000), studentId: "student-1" }));
      const invoicesById: Record<string, BillInvoiceEntity> = {
        "invoice-1": makeInvoice({ id: "invoice-1", balance: Money.fromInt(3000) }),
        "invoice-2": makeInvoice({ id: "invoice-2", balance: Money.fromInt(4000) }),
      };
      invoiceRepository.findByIdOrFail.mockImplementation(async (id: string) => invoicesById[id]);

      const result = await service.sweepToInvoices(EM, { walletId: "wallet-1", invoiceIds: ["invoice-1", "invoice-2"] }, "actor-1");

      expect(result.totalSwept.equals(Money.fromInt(5000))).toBe(true);
      expect(result.allocations).toEqual([
        { invoiceId: "invoice-1", amount: Money.fromInt(3000) },
        { invoiceId: "invoice-2", amount: Money.fromInt(2000) },
      ]);
      expect(result.shortfall).toEqual([{ invoiceId: "invoice-2", remainingBalance: Money.fromInt(2000) }]);

      // Exactly ONE journal, balanced, for the TOTAL swept — never one per invoice.
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: walletAccount.id, debit: Money.fromInt(5000), credit: Money.ZERO }),
        expect.objectContaining({ accountId: arStudentAccount.id, debit: Money.ZERO, credit: Money.fromInt(5000) }),
      ]);

      // Exactly ONE wall_transaction (via insertTransaction -> transactionRepository.create), receipt cross-referenced.
      expect(transactionRepository.create).toHaveBeenCalledTimes(1);
      expect(result.receiptId).toBe("receipt-1");
      expect(result.transactionId).toBeTruthy();
      expect(transactionRepository.updateReceiptId).toHaveBeenCalledWith(result.transactionId, "receipt-1", EM);
      expect(receiptsService.recordWalletFundedReceipt).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({
          studentId: "student-1",
          allocations: [
            { invoiceId: "invoice-1", amount: Money.fromInt(3000) },
            { invoiceId: "invoice-2", amount: Money.fromInt(2000) },
          ],
        }),
      );
    });

    it("returns a clean 'nothing to sweep' result — no journal/transaction/receipt — when the wallet balance is zero", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.ZERO }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(1000) }));

      const result = await service.sweepToInvoices(EM, { walletId: "wallet-1", invoiceIds: ["invoice-1"] }, "actor-1");

      expect(result.totalSwept.isZero()).toBe(true);
      expect(result.allocations).toEqual([]);
      expect(result.receiptId).toBeNull();
      expect(result.transactionId).toBeNull();
      expect(result.shortfall).toEqual([{ invoiceId: "invoice-1", remainingBalance: Money.fromInt(1000) }]);
      expect(postingService.post).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
      expect(receiptsService.recordWalletFundedReceipt).not.toHaveBeenCalled();
    });

    it("requires an approvalRef once the AGGREGATE swept total exceeds the transfer threshold", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) => (key.includes("threshold") ? "1000.00" : def));
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(5000), studentId: "student-1" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(5000) }));

      await expect(
        service.sweepToInvoices(EM, { walletId: "wallet-1", invoiceIds: ["invoice-1"] }, "actor-1"),
      ).rejects.toThrow(/FR-WALL-013.1/);
      expect(postingService.post).not.toHaveBeenCalled();
    });

    it("succeeds above the threshold once a valid approvalRef is supplied", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) => (key.includes("threshold") ? "1000.00" : def));
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(5000), studentId: "student-1" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(5000) }));

      const result = await service.sweepToInvoices(
        EM,
        { walletId: "wallet-1", invoiceIds: ["invoice-1"], approvalRef: "appr-1" },
        "actor-1",
      );
      expect(result.totalSwept.equals(Money.fromInt(5000))).toBe(true);
    });

    it("rejects an invoice belonging to a different student than the wallet", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(5000), studentId: "student-1" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ studentId: "other-student", balance: Money.fromInt(1000) }));

      await expect(
        service.sweepToInvoices(EM, { walletId: "wallet-1", invoiceIds: ["invoice-1"] }, "actor-1"),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects an empty invoiceIds list", async () => {
      await expect(service.sweepToInvoices(EM, { walletId: "wallet-1", invoiceIds: [] }, "actor-1")).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("transferToWallet", () => {
    it("locks both wallets in ascending-id order regardless of call-argument order", async () => {
      const walletsById: Record<string, WallWalletEntity> = {
        "wallet-zzz": makeWallet({ id: "wallet-zzz", balance: Money.fromInt(1000) }),
        "wallet-aaa": makeWallet({ id: "wallet-aaa", balance: Money.fromInt(1000) }),
      };
      walletRepository.findByIdForUpdate.mockImplementation(async (_em: unknown, id: string) => walletsById[id]);

      await service.transferToWallet(EM, { fromWalletId: "wallet-zzz", toWalletId: "wallet-aaa", amount: Money.fromInt(100) }, "actor-1");

      expect(walletRepository.findByIdForUpdate.mock.calls[0][1]).toBe("wallet-aaa");
      expect(walletRepository.findByIdForUpdate.mock.calls[1][1]).toBe("wallet-zzz");
    });

    it("creates TRANSFER_OUT/TRANSFER_IN legs against the same WALLET control account, journal balances trivially", async () => {
      const walletsById: Record<string, WallWalletEntity> = {
        "wallet-1": makeWallet({ id: "wallet-1", balance: Money.fromInt(1000) }),
        "wallet-2": makeWallet({ id: "wallet-2", balance: Money.fromInt(0) }),
      };
      walletRepository.findByIdForUpdate.mockImplementation(async (_em: unknown, id: string) => walletsById[id]);

      const result = await service.transferToWallet(EM, { fromWalletId: "wallet-1", toWalletId: "wallet-2", amount: Money.fromInt(300) }, "actor-1");

      expect(result.outTransaction.type).toBe("TRANSFER_OUT");
      expect(result.inTransaction.type).toBe("TRANSFER_IN");
      const draft = postingService.post.mock.calls[0][1];
      const totalDebit = draft.lines.reduce((s: Money, l: { debit: Money }) => s.add(l.debit), Money.ZERO);
      const totalCredit = draft.lines.reduce((s: Money, l: { credit: Money }) => s.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
      expect(draft.lines.every((l: { accountId: string }) => l.accountId === walletAccount.id)).toBe(true);
    });

    it("requires an approvalRef above the transfer threshold", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) =>
        key.includes("threshold") ? "1000.00" : def,
      );
      await expect(
        service.transferToWallet(EM, { fromWalletId: "wallet-1", toWalletId: "wallet-2", amount: Money.fromInt(5000) }, "actor-1"),
      ).rejects.toThrow(/FR-WALL-013.1/);
    });
  });

  describe("refund", () => {
    it("rejects a refund with no verified payout target (BR-WALL-06)", async () => {
      guardianRepository.findByIdOrFail.mockResolvedValue(makeGuardian({ payoutVerified: { BANK: true } }));
      await expect(
        service.refund(
          EM,
          {
            walletId: "wallet-1",
            amount: Money.fromInt(100),
            payoutMethod: "CASH",
            payoutTarget: { guardianId: "guardian-1" },
            approvalRef: "appr-1",
          },
          "actor-1",
        ),
      ).rejects.toThrow(/BR-WALL-06/);
    });

    it("rejects a refund with no approvalRef (FR-WALL-013.1)", async () => {
      await expect(
        service.refund(
          EM,
          {
            walletId: "wallet-1",
            amount: Money.fromInt(100),
            payoutMethod: "CASH",
            payoutTarget: { guardianId: "guardian-1" },
            approvalRef: "" as unknown as string,
          },
          "actor-1",
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("posts P-16 against a verified payout target", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(1000) }));
      const txn = await service.refund(
        EM,
        { walletId: "wallet-1", amount: Money.fromInt(200), payoutMethod: "CASH", payoutTarget: { guardianId: "guardian-1" }, approvalRef: "appr-1" },
        "actor-1",
      );
      expect(txn.type).toBe("REFUND");
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: walletAccount.id, debit: Money.fromInt(200) }),
        expect.objectContaining({ accountId: cashAccount.id, credit: Money.fromInt(200) }),
      ]);
    });
  });

  describe("closeWallet", () => {
    it("applies the REFUND disposition then flips status to CLOSED, in that order", async () => {
      const order: string[] = [];
      const wallets: Record<string, WallWalletEntity> = {
        "wallet-1": makeWallet({ balance: Money.fromInt(500) }),
      };
      walletRepository.findByIdForUpdate.mockImplementation(async (_em: unknown, id: string) => wallets[id]);
      walletRepository.save.mockImplementation(async (e: WallWalletEntity) => {
        if (e.status === "CLOSED") order.push("closed");
        wallets[e.id] = e;
        return e;
      });
      postingService.post.mockImplementation(async () => {
        order.push("disposition-posted");
        wallets["wallet-1"] = { ...wallets["wallet-1"], balance: Money.ZERO } as WallWalletEntity;
        return { id: "journal-1", lines: [] };
      });

      const wallet = await service.closeWallet(
        EM,
        {
          walletId: "wallet-1",
          disposition: "REFUND",
          refund: { payoutMethod: "CASH", payoutTarget: { guardianId: "guardian-1" }, approvalRef: "appr-1" },
        },
        "actor-1",
      );

      expect(order).toEqual(["disposition-posted", "closed"]);
      expect(wallet.status).toBe("CLOSED");
    });

    it("is idempotent — a no-op on an already-CLOSED wallet", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ status: "CLOSED", balance: Money.ZERO }));
      const wallet = await service.closeWallet(EM, { walletId: "wallet-1", disposition: "APPLY_TO_FEES" }, "actor-1");
      expect(wallet.status).toBe("CLOSED");
      expect(walletRepository.save).not.toHaveBeenCalled();
    });

    it("rejects closing a wallet with a negative (overdraft) balance", async () => {
      walletRepository.findByIdForUpdate.mockResolvedValue(makeWallet({ balance: Money.fromInt(-50), overdraftLimit: Money.fromInt(100) }));
      await expect(service.closeWallet(EM, { walletId: "wallet-1", disposition: "APPLY_TO_FEES" }, "actor-1")).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("reconcile", () => {
    it("records ok=true when wallet totals match the GL control account balance", async () => {
      walletRepository.listAll.mockResolvedValue([makeWallet({ balance: Money.fromInt(100) }), makeWallet({ id: "w2", balance: Money.fromInt(200) })]);
      dataSource.query.mockResolvedValue([{ balance: "300.0000" }]);
      const run = await service.reconcile();
      expect(run.ok).toBe(true);
    });

    it("records ok=false and the exact variance when totals diverge", async () => {
      walletRepository.listAll.mockResolvedValue([makeWallet({ balance: Money.fromInt(100) })]);
      dataSource.query.mockResolvedValue([{ balance: "50.0000" }]);
      const run = await service.reconcile();
      expect(run.ok).toBe(false);
      expect((run.findings as { variance: string }).variance).toBe("50.0000");
    });
  });
});
