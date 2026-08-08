import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

import { SettingsService } from "../../../platform/settings";
import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

import { GlAccountRepository, PostingService, GlIntegrityRunEntity } from "../../../accounting";
import { GlAccountEntity } from "../../../accounting/domain/gl-account.entity";
import { GlJournalEntity } from "../../../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../../../accounting/domain/gl-journal-line.entity";
import { GlJournalLineRepository } from "../../../accounting/infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../../../accounting/infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalEntity } from "../../../accounting/domain/gl-period-account-total.entity";
import { GlPeriodAccountTotalRepository } from "../../../accounting/infrastructure/gl-period-account-total.repository";
import { GlPeriodEntity } from "../../../accounting/domain/gl-period.entity";
import { GlPeriodRepository } from "../../../accounting/infrastructure/gl-period.repository";
import { GlIntegrityRunRepository } from "../../../accounting/infrastructure/gl-integrity-run.repository";

import { StdGuardianEntity } from "../../students/domain/std-guardian.entity";
import { StdGuardianRepository } from "../../students/infrastructure/std-guardian.repository";
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { StdStudentRepository } from "../../students/infrastructure/std-student.repository";
import { StdLedgerEntryEntity } from "../../students/domain/std-ledger-entry.entity";
import { StdLedgerEntryRepository } from "../../students/infrastructure/std-ledger-entry.repository";
import { StudentLedgerService } from "../../students/application/student-ledger.service";

import { BillInstallmentEntity } from "../../billing/domain/bill-installment.entity";
import { BillInstallmentRepository } from "../../billing/infrastructure/bill-installment.repository";
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";
import { BillInvoiceRepository } from "../../billing/infrastructure/bill-invoice.repository";
import { BillStudentCreditEntity } from "../../billing/domain/bill-student-credit.entity";
import { BillStudentCreditRepository } from "../../billing/infrastructure/bill-student-credit.repository";
import { BillStudentCreditEntryEntity } from "../../billing/domain/bill-student-credit-entry.entity";
import { BillStudentCreditEntryRepository } from "../../billing/infrastructure/bill-student-credit-entry.repository";
import { StudentCreditService } from "../../billing/application/student-credit.service";

import { PayCashierSessionEntity } from "../../payments/domain/pay-cashier-session.entity";
import { PayCashierSessionRepository } from "../../payments/infrastructure/pay-cashier-session.repository";
import { PayChequeEntity } from "../../payments/domain/pay-cheque.entity";
import { PayChequeRepository } from "../../payments/infrastructure/pay-cheque.repository";
import { PayReceiptEntity } from "../../payments/domain/pay-receipt.entity";
import { PayReceiptRepository } from "../../payments/infrastructure/pay-receipt.repository";
import { PayReceiptSplitEntity } from "../../payments/domain/pay-receipt-split.entity";
import { PayReceiptSplitRepository } from "../../payments/infrastructure/pay-receipt-split.repository";
import { PayReceiptAllocationEntity } from "../../payments/domain/pay-receipt-allocation.entity";
import { PayReceiptAllocationRepository } from "../../payments/infrastructure/pay-receipt-allocation.repository";
import { AllocationService } from "../../payments/application/allocation.service";
import { ReceiptsService } from "../../payments/application/receipts.service";

// Phase 6 Slice 16 (Part 1) — ReceiptsService now takes a
// DocumentVerificationService (mints a docv_record token on captureReceipt()).
import { DocumentVerificationService } from "../../../platform/document-verification/application/document-verification.service";
import { DocvRecordEntity } from "../../../platform/document-verification/domain/docv-record.entity";
import { DocvRecordRepository } from "../../../platform/document-verification/infrastructure/docv-record.repository";

import { WallWalletEntity } from "../domain/wall-wallet.entity";
import { WallWalletRepository } from "../infrastructure/wall-wallet.repository";
import { WallTransactionEntity } from "../domain/wall-transaction.entity";
import { WallTransactionRepository } from "../infrastructure/wall-transaction.repository";
import { WallServicePointEntity } from "../domain/wall-service-point.entity";
import { WallServicePointRepository } from "../infrastructure/wall-service-point.repository";
import { WalletTransactionsService } from "../application/wallet-transactions.service";

/**
 * Module 11 (Wallet) capstone integration test — mirrors
 * `domains/payments/__tests__/payments-e2e.integration.spec.ts`'s pattern
 * (real repository/service instances, no Nest DI, self-skips without a
 * reachable Postgres). Walks: provision a wallet -> top up (P-13) -> spend
 * at a service point (P-14) -> transfer the remainder to fees (P-15) ->
 * close it out (BR-WALL-07), asserting the GL `WALLET` control account
 * balance nets to zero throughout and that
 * `ck_wall_wallet_balance_floor`/`trg_wall_wallet_closed_requires_zero`
 * (migration `0090`) genuinely reject illegal states at the DB layer.
 *
 * **Phase 6 Slice 12 (Part A)**: `WalletTransactionsService` grew two new
 * constructor dependencies (`StdStudentRepository`/`ReceiptsService`) since
 * `transferToFees()` now also calls `ReceiptsService
 * .recordWalletFundedReceipt()` — this test wires REAL instances of both
 * (and everything `ReceiptsService` itself needs) against the same real
 * `DataSource`, rather than stubbing them out, so the transfer-to-fees step
 * below exercises the real, complete, end-to-end wallet-funded-receipt path
 * and asserts against it directly (real `pay_receipt`/`pay_receipt_split`/
 * `pay_receipt_allocation` rows, `journal_id IS NULL`).
 *
 * **Assumption**: migrations up to and including `0900` have already run —
 * reuses the seeded `2030`/`1100`/`1010`/`4030` `gl_account` rows where
 * present, falling back to throwaway fresh-DB fixtures otherwise (same
 * fallback discipline `payments-e2e.integration.spec.ts` established).
 */
describe("wallet module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[wallet-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "provision -> top up -> spend -> transfer to fees -> close, asserting GL balance and DB constraints throughout",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[wallet-e2e.integration.spec] SKIPPED (no DB) — end-to-end wallet capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- Wide-enough gl_period.
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `WALL-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      const createdAccountIds: string[] = [];
      const walletControlAccountId = await reuseOrCreateAccount(
        source,
        "control_domain = 'WALLET'",
        { code: `WALL-E2E-WAL-${suffix}`, name: "E2E Wallet Control", class: "LIABILITY", controlDomain: "WALLET" },
        createdAccountIds,
      );
      const arStudentAccountId = await reuseOrCreateAccount(
        source,
        "control_domain = 'AR_STUDENT'",
        { code: `WALL-E2E-AR-${suffix}`, name: "E2E AR Student", class: "ASSET", controlDomain: "AR_STUDENT" },
        createdAccountIds,
      );
      const cashAccountId = await reuseOrCreateByCode(source, "1010", "Petty Cash", "ASSET", createdAccountIds);
      const incomeAccountId = await reuseOrCreateByCode(source, "4030", "Other Income", "INCOME", createdAccountIds);

      // ---- Student + academic scaffolding.
      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const actorId = generateUuidV7();
      await source.query(`INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2020-01-01', '2020-12-31')`, [
        academicYearId,
        `WALL-E2E-AY-${String(suffix).slice(-8)}`,
      ]);
      await source.query(
        `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on) VALUES ($1, $2, 'Term 1', 1, '2020-01-01', '2020-04-30')`,
        [termId, academicYearId],
      );
      await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `WALL-E2E-CLASS-${suffix}`]);
      await source.query(
        `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
         VALUES ($1, $2, 'Capstone', 'Walleteer', $3, 'ACTIVE', 'DAY', '2020-01-01')`,
        [studentId, `WALL-E2E-ADM-${suffix}`, classId],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Actor', 'ACTIVE', $3)`,
        [actorId, `wall-e2e-actor-${suffix}`, `+2548${suffix}`.slice(0, 13)],
      );

      const invoiceId = generateUuidV7();
      await source.query(
        `INSERT INTO app.bill_invoice (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
         VALUES ($1, $2, $3, $4, '2020-06-01', '2020-06-15', 'POSTED', 'ADHOC', 800.00, 800.00, 800.00)`,
        [invoiceId, `WALL-E2E-INV-${suffix}`, studentId, termId],
      );

      const servicePointId = generateUuidV7();
      await source.query(
        `INSERT INTO app.wall_service_point (id, name, type, gl_income_account_id, is_active) VALUES ($1, $2, 'SHOP', $3, true)`,
        [servicePointId, `WALL-E2E-SHOP-${suffix}`, incomeAccountId],
      );

      // ---- Service instantiation (real repositories, no Nest DI).
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(
        numberingSeriesRepository,
        {} as ConstructorParameters<typeof NumberingService>[1] as AcademicCalendarService,
      );
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
        glAccountRepository,
        new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
        numberingService,
      );

      const walletRepository = new WallWalletRepository(source.getRepository(WallWalletEntity));
      const transactionRepository = new WallTransactionRepository(source.getRepository(WallTransactionEntity));
      const servicePointRepository = new WallServicePointRepository(source.getRepository(WallServicePointEntity));
      const guardianRepository = new StdGuardianRepository(source.getRepository(StdGuardianEntity));
      const invoiceRepository = new BillInvoiceRepository(source.getRepository(BillInvoiceEntity));
      const installmentRepository = new BillInstallmentRepository(source.getRepository(BillInstallmentEntity));
      const integrityRunRepository = new GlIntegrityRunRepository(source.getRepository(GlIntegrityRunEntity));

      const settingsServiceStub = { getTyped: async <T>(_key: string, defaultValue: T): Promise<T> => defaultValue } as unknown as SettingsService;
      const outboxWriterStub = { write: async () => undefined } as unknown as import("../../../shared/events/outbox-writer.service").OutboxWriterService;

      // ---- Phase 6 Slice 12 (Part A) — real ReceiptsService + everything it needs, wired against the same real DataSource.
      const studentRepository = new StdStudentRepository(source.getRepository(StdStudentEntity));
      const ledgerEntryRepository = new StdLedgerEntryRepository(source.getRepository(StdLedgerEntryEntity));
      const studentLedgerService = new StudentLedgerService(ledgerEntryRepository);
      const receiptRepository = new PayReceiptRepository(source.getRepository(PayReceiptEntity));
      const receiptSplitRepository = new PayReceiptSplitRepository(source.getRepository(PayReceiptSplitEntity));
      const receiptAllocationRepository = new PayReceiptAllocationRepository(source.getRepository(PayReceiptAllocationEntity));
      const chequeRepository = new PayChequeRepository(source.getRepository(PayChequeEntity));
      const cashierSessionRepository = new PayCashierSessionRepository(source.getRepository(PayCashierSessionEntity));
      const allocationService = new AllocationService(settingsServiceStub, invoiceRepository);
      // Phase 6 Slice 12 (Part D) — real StudentCreditService, wired against
      // the same real DataSource — ReceiptsService grew this new dependency
      // this pass (captureReceipt() now issues a real Credit Balance entry
      // on an overpayment); wired for real here rather than stubbed out, the
      // same "exercise the real end-to-end path" discipline Part A's own
      // extension of this file already established for ReceiptsService's
      // other dependencies.
      const studentCreditRepository = new BillStudentCreditRepository(source.getRepository(BillStudentCreditEntity));
      const studentCreditEntryRepository = new BillStudentCreditEntryRepository(source.getRepository(BillStudentCreditEntryEntity));
      const studentCreditService = new StudentCreditService(studentCreditRepository, studentCreditEntryRepository);
      // Phase 6 Slice 16 (Part 1) — real repository/service, same "exercise
      // the real end-to-end path" discipline this file's own comment above
      // documents for StudentCreditService.
      const documentVerificationService = new DocumentVerificationService(
        new DocvRecordRepository(source.getRepository(DocvRecordEntity)),
      );
      const receiptsService = new ReceiptsService(
        receiptRepository,
        receiptSplitRepository,
        receiptAllocationRepository,
        chequeRepository,
        cashierSessionRepository,
        glAccountRepository,
        postingService,
        numberingService,
        studentLedgerService,
        ledgerEntryRepository,
        studentRepository,
        invoiceRepository,
        installmentRepository,
        allocationService,
        studentCreditService,
        documentVerificationService,
      );

      const walletTransactionsService = new WalletTransactionsService(
        walletRepository,
        transactionRepository,
        servicePointRepository,
        glAccountRepository,
        postingService,
        settingsServiceStub,
        guardianRepository,
        invoiceRepository,
        installmentRepository,
        integrityRunRepository,
        outboxWriterStub,
        source,
        studentRepository,
        receiptsService,
      );

      let walletId: string | null = null;

      try {
        // ---- baseline: the shared WALLET control account BEFORE this run's own postings ----
        // Phase 6 Slice 12 (Part A) — captured explicitly rather than assumed
        // zero: this dev DB now carries real, legitimate ACTIVE wallets with
        // nonzero balances (unrelated slices' own residue, confirmed via a
        // direct query before writing this fix — NOT introduced by this
        // pass), so asserting the WHOLE shared account nets to zero is no
        // longer a valid precondition for this test to depend on. The real
        // invariant this test cares about — THIS run's own top-up/spend/
        // transfer sequence nets to exactly zero — is checked as a DELTA
        // against this baseline instead, which is both more correct and
        // robust to ambient state, never depending on nothing else existing.
        const [baselineRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1`,
          [walletControlAccountId],
        );
        const walletControlBaseline = Money.fromDecimalString(baselineRow.balance);

        // ---- provision -----------------------------------------------------
        const wallet = await source.transaction("REPEATABLE READ", async () =>
          walletRepository.create({ studentId, status: "ACTIVE", balance: Money.ZERO, overdraftLimit: Money.ZERO, categoryBlocks: [] }),
        );
        walletId = wallet.id;

        // ---- top up (P-13) ---------------------------------------------------
        await source.transaction("REPEATABLE READ", (em) =>
          walletTransactionsService.topUp(em, { walletId: wallet.id, amount: Money.fromInt(1000), method: "CASH" }, actorId),
        );

        // ---- DB constraint: trg_wall_wallet_closed_requires_zero rejects a nonzero-balance close (balance is 1000 here) ----
        await expect(source.query(`UPDATE app.wall_wallet SET status = 'CLOSED' WHERE id = $1`, [wallet.id])).rejects.toThrow();

        // ---- spend (P-14) ------------------------------------------------------
        await source.transaction("REPEATABLE READ", (em) =>
          walletTransactionsService.spend(em, { walletId: wallet.id, amount: Money.fromInt(200), servicePointId }, actorId),
        );

        // ---- transfer to fees (P-15), zeroing the wallet ------------------------
        const transferTxn = await source.transaction("REPEATABLE READ", (em) =>
          walletTransactionsService.transferToFees(em, { walletId: wallet.id, amount: Money.fromInt(800), invoiceId }, actorId),
        );

        const afterTransfer = await walletRepository.findByIdOrFail(wallet.id);
        expect(afterTransfer.balance.isZero()).toBe(true);

        // ---- GL WALLET control account: THIS run's own postings net to zero (1000 credit - 200 debit - 800 debit), as a delta against the captured baseline ----
        const [glRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1`,
          [walletControlAccountId],
        );
        const walletControlDelta = Money.fromDecimalString(glRow.balance).subtract(walletControlBaseline);
        expect(walletControlDelta.isZero()).toBe(true);

        // ---- invoice was reduced by the transfer ----
        const updatedInvoice = await invoiceRepository.findByIdOrFail(invoiceId);
        expect(updatedInvoice.balance.isZero()).toBe(true);
        expect(updatedInvoice.status).toBe("PAID");

        // ---- Phase 6 Slice 12 (Part A) — transferToFees() now ALSO produces a real, wallet-funded pay_receipt ----
        expect(transferTxn.receiptId).toBeTruthy();
        const receipt = await receiptRepository.findByIdOrFail(transferTxn.receiptId!);
        expect(receipt.journalId).toBeNull();
        expect(receipt.total.equals(Money.fromInt(800))).toBe(true);
        expect(receipt.status).toBe("POSTED");
        const receiptSplits = await receiptSplitRepository.listByReceipt(receipt.id);
        expect(receiptSplits).toHaveLength(1);
        expect(receiptSplits[0].method).toBe("WALLET");
        expect(receiptSplits[0].amount.equals(Money.fromInt(800))).toBe(true);
        const receiptAllocations = await receiptAllocationRepository.listByReceipt(receipt.id);
        expect(receiptAllocations).toHaveLength(1);
        expect(receiptAllocations[0].invoiceId).toBe(invoiceId);
        expect(receiptAllocations[0].amount.equals(Money.fromInt(800))).toBe(true);
        expect(receiptAllocations[0].toPrepayment).toBe(false);
        // Direct psql cross-check of the receipt_id cross-reference on the wall_transaction row.
        const [txnRow]: Array<{ receipt_id: string }> = await source.query(
          `SELECT receipt_id FROM app.wall_transaction WHERE id = $1`,
          [transferTxn.id],
        );
        expect(txnRow.receipt_id).toBe(receipt.id);

        // ---- reversal guard: this receipt is WALLET-funded and must be rejected ----
        await expect(
          source.transaction("REPEATABLE READ", (em) => receiptsService.reverseReceipt(em, receipt.id, "ERROR", null, actorId)),
        ).rejects.toThrow(/can't be reversed here/);

        // ---- DB constraint: balance floor (ck_wall_wallet_balance_floor) ----
        await expect(
          source.query(`UPDATE app.wall_wallet SET balance = -1.00 WHERE id = $1`, [wallet.id]),
        ).rejects.toThrow();
        // restore to a legal value for the next assertion (the failed UPDATE above did not commit any change)

        // ---- close it out (BR-WALL-07) — balance is already zero, no disposition needed ----
        const closed = await source.transaction("REPEATABLE READ", (em) =>
          walletTransactionsService.closeWallet(em, { walletId: wallet.id, disposition: "APPLY_TO_FEES" }, actorId),
        );
        expect(closed.status).toBe("CLOSED");
      } finally {
        if (walletId) {
          await source.query(`DELETE FROM app.wall_transaction WHERE wallet_id = $1`, [walletId]);
          await source.query(`DELETE FROM app.wall_wallet WHERE id = $1`, [walletId]);
        }
        // Phase 6 Slice 12 (Part A) — the wallet-funded pay_receipt
        // transferToFees() now creates (pay_receipt_split/pay_receipt_allocation
        // cascade off it, migration 0080's ON DELETE CASCADE) and its
        // std_ledger_entry mirror are both RESTRICT-referenced by
        // bill_invoice/std_student/usr_user below — deleted first, same
        // ordering discipline this file's own comment two lines down already
        // documents for gl_account/gl_period/gl_fiscal_year.
        await source.query(`DELETE FROM app.pay_receipt WHERE student_id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_ledger_entry WHERE student_id = $1`, [studentId]);
        await source.query(`DELETE FROM app.wall_service_point WHERE id = $1`, [servicePointId]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
        await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [actorId]);
        // gl_account/gl_period/gl_fiscal_year are all RESTRICT-referenced by the
        // now-permanent gl_journal_line rows the top-up/spend/transfer postings
        // above created (gl_journal_line is immutable, mirrors trg_gl_journal_immutable) —
        // deleting them fails by design. Left as inert, uniquely-suffixed residue,
        // same established pattern as payments-e2e.integration.spec.ts.
        void createdAccountIds;
        void periodId;
        void fiscalYearId;
        void walletControlAccountId;
        void arStudentAccountId;
        void cashAccountId;
      }
    },
    60000,
  );
});

async function reuseOrCreateAccount(
  source: DataSource,
  whereClause: string,
  fresh: { code: string; name: string; class: string; controlDomain: string },
  createdAccountIds: string[],
): Promise<string> {
  const existing: Array<{ id: string }> = await source.query(
    `SELECT id FROM app.gl_account WHERE ${whereClause} AND is_active = true AND is_postable = true`,
  );
  if (existing.length >= 1) return existing[0].id;
  const id = generateUuidV7();
  await source.query(
    `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, control_domain, is_active) VALUES ($1, $2, $3, $4, true, true, $5, true)`,
    [id, fresh.code, fresh.name, fresh.class, fresh.controlDomain],
  );
  createdAccountIds.push(id);
  return id;
}

async function reuseOrCreateByCode(source: DataSource, code: string, name: string, klass: string, createdAccountIds: string[]): Promise<string> {
  const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [code]);
  if (existing.length > 0) return existing[0].id;
  const id = generateUuidV7();
  await source.query(
    `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, is_active) VALUES ($1, $2, $3, $4, true, false, true)`,
    [id, code, name, klass],
  );
  createdAccountIds.push(id);
  return id;
}
