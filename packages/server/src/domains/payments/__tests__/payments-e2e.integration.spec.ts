import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

import { SettingsService } from "../../../platform/settings";
import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

import { GlAccountRepository, PostingService } from "../../../accounting";
import { GlAccountEntity } from "../../../accounting/domain/gl-account.entity";
import { GlJournalEntity } from "../../../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../../../accounting/domain/gl-journal-line.entity";
import { GlJournalLineRepository } from "../../../accounting/infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../../../accounting/infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalEntity } from "../../../accounting/domain/gl-period-account-total.entity";
import { GlPeriodAccountTotalRepository } from "../../../accounting/infrastructure/gl-period-account-total.repository";
import { GlPeriodEntity } from "../../../accounting/domain/gl-period.entity";
import { GlPeriodRepository } from "../../../accounting/infrastructure/gl-period.repository";

import { StdLedgerEntryEntity } from "../../students/domain/std-ledger-entry.entity";
import { StdLedgerEntryRepository } from "../../students/infrastructure/std-ledger-entry.repository";
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { StdStudentRepository } from "../../students/infrastructure/std-student.repository";
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

import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { PayCashierSessionRepository } from "../infrastructure/pay-cashier-session.repository";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PayReceiptSplitRepository } from "../infrastructure/pay-receipt-split.repository";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";
import { PayReceiptAllocationRepository } from "../infrastructure/pay-receipt-allocation.repository";
import { PayChequeEntity } from "../domain/pay-cheque.entity";
import { PayChequeRepository } from "../infrastructure/pay-cheque.repository";

import { CashierSessionsService } from "../application/cashier-sessions.service";
import { AllocationService } from "../application/allocation.service";
import { ReceiptsService } from "../application/receipts.service";

// Phase 6 Slice 16 (Part 1) — ReceiptsService now takes a
// DocumentVerificationService (mints a docv_record token on captureReceipt()).
import { DocumentVerificationService } from "../../../platform/document-verification/application/document-verification.service";
import { DocvRecordEntity } from "../../../platform/document-verification/domain/docv-record.entity";
import { DocvRecordRepository } from "../../../platform/document-verification/infrastructure/docv-record.repository";

/**
 * The capstone integration test for Module 10 (Payments) — walks the core
 * round trip against real service instances and a real Postgres instance:
 * open a cashier session -> capture a CASH receipt against a real,
 * already-POSTED `bill_invoice` fixture -> verify the resulting GL journal
 * balances and the invoice's `paid_amount`/`balance`/`status` -> reverse the
 * receipt -> verify the GL/invoice unwind. Mirrors
 * `domains/billing/__tests__/billing-e2e.integration.spec.ts`'s pattern
 * (real repository/service instances, no Nest DI) and
 * `payments-triggers.integration.spec.ts`'s connectivity-probe self-skip.
 *
 * **This test's assumption**: migrations UP TO AND INCLUDING `0900` have
 * already run — it looks up the seeded `1010 Petty Cash` `gl_account` by
 * `code` (the exact CASH clearing-account resolution
 * `payment-clearing-accounts.util.ts` performs) and creates one only as a
 * fresh-DB fallback if it is genuinely missing.
 *
 * A real `bill_invoice` fixture is constructed directly via SQL (the same
 * minimal-column shape `billing-triggers.integration.spec.ts` uses) rather
 * than routed through `InvoicingService.generateInvoice()`/`postInvoice()`
 * — this test's focus is `ReceiptsService`'s own capture/reversal round
 * trip, not fee-structure/invoicing mechanics already covered by Module 9's
 * own capstone spec.
 */
describe("payments module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[payments-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "open session -> capture CASH receipt against an open invoice -> verify GL/invoice -> reverse -> verify the unwind",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[payments-e2e.integration.spec] SKIPPED (no DB) — end-to-end payments capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- Wide-enough gl_period (this test doesn't stamp a caller-supplied journalDate for the reversal — PostingService.reverse() reuses the original journal's period resolution logic against "today").
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `PAY-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      // ---- AR-Student control account: reuse the seeded one if `0900` already ran, else create a throwaway one (same pattern billing-e2e.integration.spec.ts uses).
      const existingArStudent: Array<{ id: string }> = await source.query(
        `SELECT id FROM app.gl_account WHERE control_domain = 'AR_STUDENT' AND is_active = true AND is_postable = true`,
      );
      let arStudentAccountId: string;
      let createdArStudentAccount = false;
      if (existingArStudent.length === 1) {
        arStudentAccountId = existingArStudent[0].id;
      } else if (existingArStudent.length === 0) {
        arStudentAccountId = generateUuidV7();
        createdArStudentAccount = true;
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, control_domain, is_active)
           VALUES ($1, $2, 'PAY-E2E AR Student', 'ASSET', true, true, 'AR_STUDENT', true)`,
          [arStudentAccountId, `PAY-E2E-AR-${suffix}`],
        );
      } else {
        throw new Error(
          `payments-e2e.integration.spec: ${existingArStudent.length} active/postable AR_STUDENT gl_account rows found — configuration anomaly`,
        );
      }

      // ---- CASH clearing account: `resolveClearingAccount()` hardcodes code '1010' for CASH — reuse the `0900`-seeded "Petty Cash" row, or create it as a fresh-DB fallback.
      const existingCash: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = '1010'`);
      let cashAccountId: string;
      let createdCashAccount = false;
      if (existingCash.length > 0) {
        cashAccountId = existingCash[0].id;
      } else {
        cashAccountId = generateUuidV7();
        createdCashAccount = true;
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, is_active)
           VALUES ($1, '1010', 'Petty Cash', 'ASSET', true, false, true)`,
          [cashAccountId],
        );
      }

      // ---- Student + academic scaffolding.
      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const cashierId = generateUuidV7();
      // set_academic_year.name is varchar(20) (uq_set_academic_year_name) — "PAY-E2E-AY-" (11
      // chars) + a 13-digit Date.now() suffix is 24 chars, overflowing it (value too long for
      // type character varying(20)). "PAY-AY-" (7 chars) + 13 digits = 20, exactly at budget —
      // same convention billing-e2e.integration.spec.ts's own "E2E-AY-" prefix already uses.
      await source.query(
        `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2020-01-01', '2020-12-31')`,
        [academicYearId, `PAY-AY-${suffix}`],
      );
      await source.query(
        `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
         VALUES ($1, $2, 'Term 1', 1, '2020-01-01', '2020-04-30')`,
        [termId, academicYearId],
      );
      await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `PAY-E2E-CLASS-${suffix}`]);
      await source.query(
        `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
         VALUES ($1, $2, 'Capstone', 'Payer', $3, 'ACTIVE', 'DAY', '2020-01-01')`,
        [studentId, `PAY-E2E-ADM-${suffix}`, classId],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
         VALUES ($1, $2, 'hash', 'E2E Cashier', 'ACTIVE', $3)`,
        // phone is varchar(20); "+2547" (5 chars) + a 13-digit Date.now() suffix is 18 chars, well
        // within budget — previously `.slice(0, 13)` truncated the WHOLE string (not just the
        // suffix) down to the first 8 digits of the timestamp, so phone only changed once per
        // ~100 real seconds and collided across test files/runs inside that window
        // (uq_usr_user_phone_p). Keep the full suffix instead.
        [cashierId, `pay-e2e-cashier-${suffix}`, `+2547${suffix}`],
      );

      // ---- A real, already-POSTED bill_invoice fixture — minimal-column shape, same as billing-triggers.integration.spec.ts.
      const invoiceId = generateUuidV7();
      await source.query(
        `INSERT INTO app.bill_invoice
           (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
         VALUES ($1, $2, $3, $4, '2020-06-01', '2020-06-15', 'POSTED', 'ADHOC', 1000.00, 1000.00, 1000.00)`,
        [invoiceId, `PAY-E2E-INV-${suffix}`, studentId, termId],
      );

      // ---- Service instantiation (real repositories, no Nest DI — see class doc comment).
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(
        numberingSeriesRepository,
        {} as ConstructorParameters<typeof NumberingService>[1] as AcademicCalendarService, // NEVER reset_policy for PAY_RECEIPT/RVS_PAY_RECEIPT series never touches this collaborator.
      );
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
        glAccountRepository,
        new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
        numberingService,
      );

      const studentRepository = new StdStudentRepository(source.getRepository(StdStudentEntity));
      const ledgerEntryRepository = new StdLedgerEntryRepository(source.getRepository(StdLedgerEntryEntity));
      const studentLedgerService = new StudentLedgerService(ledgerEntryRepository);

      const invoiceRepository = new BillInvoiceRepository(source.getRepository(BillInvoiceEntity));
      const installmentRepository = new BillInstallmentRepository(source.getRepository(BillInstallmentEntity));

      const sessionRepository = new PayCashierSessionRepository(source.getRepository(PayCashierSessionEntity));
      const receiptRepository = new PayReceiptRepository(source.getRepository(PayReceiptEntity));
      const splitRepository = new PayReceiptSplitRepository(source.getRepository(PayReceiptSplitEntity));
      const allocationRepository = new PayReceiptAllocationRepository(source.getRepository(PayReceiptAllocationEntity));
      const chequeRepository = new PayChequeRepository(source.getRepository(PayChequeEntity));

      // A trivial settings stub — every key this flow reads (BR-PAY-02's allocation
      // rule, BR-PAY-05's variance tolerance) simply returns its own default; no
      // real `set_setting` row is needed for this test's assertions.
      const settingsServiceStub = {
        getTyped: async <T>(_key: string, defaultValue: T): Promise<T> => defaultValue,
      } as unknown as SettingsService;

      const allocationService = new AllocationService(settingsServiceStub, invoiceRepository);
      // Phase 6 Slice 12 (Part D) — real StudentCreditService, wired against
      // the same real DataSource, same discipline Part A's own extension of
      // this file already established for ReceiptsService's other real
      // dependencies (see wallet-e2e.integration.spec.ts's identical
      // addition for its own ReceiptsService construction).
      const studentCreditRepository = new BillStudentCreditRepository(source.getRepository(BillStudentCreditEntity));
      const studentCreditEntryRepository = new BillStudentCreditEntryRepository(source.getRepository(BillStudentCreditEntryEntity));
      const studentCreditService = new StudentCreditService(studentCreditRepository, studentCreditEntryRepository);
      // Phase 6 Slice 16 (Part 1) — real repository/service, same "real
      // instance, no Nest DI" discipline every collaborator above follows.
      const documentVerificationService = new DocumentVerificationService(
        new DocvRecordRepository(source.getRepository(DocvRecordEntity)),
      );
      const receiptsService = new ReceiptsService(
        receiptRepository,
        splitRepository,
        allocationRepository,
        chequeRepository,
        sessionRepository,
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
      const cashierSessionsService = new CashierSessionsService(
        sessionRepository,
        receiptRepository,
        splitRepository,
        settingsServiceStub,
        source,
      );

      let sessionId: string | null = null;
      let receiptId: string | null = null;
      let receiptJournalId: string | null = null;
      let contraReceiptId: string | null = null;
      let contraJournalId: string | null = null;

      try {
        // ---- 1. Open a cashier session.
        const session = await cashierSessionsService.openSession(cashierId, "E2E-TILL", Money.fromInt(0));
        sessionId = session.id;
        expect(session.status).toBe("OPEN");

        // ---- 2. Capture a CASH receipt against the open invoice (BR-PAY-01/02/04, P-08).
        const receipt = await runInTransaction(source, (manager) =>
          receiptsService.captureReceipt(manager, {
            studentId,
            payerName: "Capstone Payer",
            receiptDate: "2020-06-05",
            total: Money.fromInt(1000),
            splits: [{ method: "CASH", amount: Money.fromInt(1000) }],
            cashierId,
            sessionId: session.id,
          }),
        );
        receiptId = receipt.id;
        receiptJournalId = receipt.journalId;
        expect(receipt.status).toBe("POSTED");
        expect(receipt.total.equals(Money.fromInt(1000))).toBe(true);

        // ---- 3. Verify the GL journal balances (CASH debit / AR-Student credit, P-08).
        const receiptLines = await source.getRepository(GlJournalLineEntity).find({ where: { journalId: receiptJournalId! } });
        const receiptDebitTotal = receiptLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
        const receiptCreditTotal = receiptLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
        expect(receiptDebitTotal.equals(receiptCreditTotal)).toBe(true);
        expect(receiptDebitTotal.equals(Money.fromInt(1000))).toBe(true);
        expect(receiptLines.find((l) => l.accountId === cashAccountId)?.debit.equals(Money.fromInt(1000))).toBe(true);
        expect(receiptLines.find((l) => l.accountId === arStudentAccountId)?.credit.equals(Money.fromInt(1000))).toBe(true);

        // ---- 4. Verify invoice state moved to fully PAID.
        const paidInvoice = await invoiceRepository.findByIdOrFail(invoiceId);
        expect(paidInvoice.paidAmount.equals(Money.fromInt(1000))).toBe(true);
        expect(paidInvoice.balance.equals(Money.ZERO)).toBe(true);
        expect(paidInvoice.status).toBe("PAID");
        expect(paidInvoice.balance.equals(paidInvoice.total.subtract(paidInvoice.paidAmount))).toBe(true);

        // ---- 5. Reverse the receipt (BR-PAY-08) — approvalRef null (mirrors ChequesService.bounce()'s single-split path; the controller layer's PAYMENT_REVERSALS gate is a separate, already-tested concern).
        const contra = await runInTransaction(source, (manager) =>
          receiptsService.reverseReceipt(manager, receiptId!, "ERROR", null, cashierId),
        );
        contraReceiptId = contra.id;
        contraJournalId = contra.journalId;
        expect(contra.status).toBe("POSTED");
        expect(contra.reversalOfId).toBe(receiptId);
        expect(contra.number.startsWith("RVS-")).toBe(true);

        // ---- 6. Verify the original flipped to REVERSED.
        const reversedOriginal = await receiptRepository.findByIdOrFail(receiptId!);
        expect(reversedOriginal.status).toBe("REVERSED");
        expect(reversedOriginal.reversalReason).toBe("ERROR");

        // ---- 7. Verify the reversal journal is balanced and swaps the original's debit/credit.
        const reversalLines = await source.getRepository(GlJournalLineEntity).find({ where: { journalId: contraJournalId! } });
        const reversalDebitTotal = reversalLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
        const reversalCreditTotal = reversalLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
        expect(reversalDebitTotal.equals(reversalCreditTotal)).toBe(true);
        expect(reversalDebitTotal.equals(Money.fromInt(1000))).toBe(true);
        expect(reversalLines.find((l) => l.accountId === arStudentAccountId)?.debit.equals(Money.fromInt(1000))).toBe(true);
        expect(reversalLines.find((l) => l.accountId === cashAccountId)?.credit.equals(Money.fromInt(1000))).toBe(true);

        // ---- 8. Verify the invoice unwound exactly back to its pre-receipt state.
        const unwoundInvoice = await invoiceRepository.findByIdOrFail(invoiceId);
        expect(unwoundInvoice.paidAmount.equals(Money.ZERO)).toBe(true);
        expect(unwoundInvoice.balance.equals(Money.fromInt(1000))).toBe(true);
        expect(unwoundInvoice.status).toBe("POSTED");

        // ---- 9. Student-ledger net consistency: +1000 (receipt) - 1000 (reversal) = 0.
        const statement = await studentLedgerService.getStatement(studentId);
        expect(statement.length).toBeGreaterThanOrEqual(2);
        const finalRunningBalance = statement[statement.length - 1].runningBalance;
        expect(finalRunningBalance.equals(Money.ZERO)).toBe(true);
      } finally {
        // gl_journal_line/gl_journal are permanently immutable once posted (trg_gl_journal_immutable,
        // BR-GEN-03 — confirmed by direct testing), so they're left as inert residue below (same
        // precedent as reporting-foundation.integration.spec.ts's GL cleanup fix). Deleting
        // pay_receipt_allocation/pay_receipt_split BEFORE their parent pay_receipt would also trip
        // trg_pay_allocations_sum/trg_pay_splits_sum (deferred to COMMIT) — both FKs are ON DELETE
        // CASCADE, so deleting the receipt alone removes both in the same transaction, and by the
        // time the deferred checks run, the receipt row is gone too and they short-circuit cleanly.
        const journalIds = [receiptJournalId, contraJournalId].filter((x): x is string => Boolean(x));
        void journalIds;

        // Original before contra — contra.reversal_of_id -> original is FK RESTRICT.
        if (contraReceiptId) {
          await source.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [contraReceiptId]);
        }
        if (receiptId) {
          await source.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [receiptId]);
        }

        if (sessionId) {
          await source.query(`DELETE FROM app.pay_cashier_session WHERE id = $1`, [sessionId]);
        }

        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
        // std_student is still RESTRICT-referenced by the real std_ledger_entry rows the receipt
        // capture + reversal flow above created (fk_std_ledger_entry_student_id — std_ledger_entry
        // is an append-only ledger with no delete path, mirrors gl_journal_line's immutability).
        // std_class is then transitively blocked too (fk_std_student_class_id, since the student
        // above is still there referencing it). Both left as inert, uniquely-suffixed residue for
        // the same reason as the GL rows below.
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [cashierId]);

        // gl_period_account_total (writer-guarded) and gl_account/gl_period/gl_fiscal_year (all
        // RESTRICT-referenced by the now-permanent gl_journal_line rows above) can't be deleted
        // once real postings exist — left as inert residue for the same reason noted above.
      }
    },
    60_000,
  );
});
