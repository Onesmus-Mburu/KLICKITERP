import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

import { NumberingService } from "../../../platform/settings";
import {
  GlAccountRepository,
  GlJournalRepository,
  GlJournalLineRepository,
  GlPeriodAccountTotalRepository,
  GlPeriodRepository,
  PostingService,
  GlAccountEntity,
  GlJournalEntity,
  GlJournalLineEntity,
  GlPeriodAccountTotalEntity,
  GlPeriodEntity,
} from "../../../accounting";

import { RptSavedParamsEntity } from "../domain/rpt-saved-params.entity";
import { RptScheduleEntity } from "../domain/rpt-schedule.entity";
import { RptExportJobEntity } from "../domain/rpt-export-job.entity";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";

/**
 * Module 18 (Reporting Engine + Dashboard) **foundation pass** integration
 * test — self-skips (not fails) when no DB is reachable, same connectivity-
 * probe pattern as every prior module's integration spec
 * (docs/phase-5/PROGRESS.md "Environment status").
 *
 * Two concerns:
 *
 * 1. Reachability of the 3 owned `rpt_*` tables (cheap, mirrors every other
 *    module's own table-reachability `it.each`).
 * 2. **The genuinely valuable part**: proves each of the 5 materialized
 *    views (migration `0160` Part B) can actually be `REFRESH
 *    MATERIALIZED VIEW CONCURRENTLY`'d and queried without a SQL error
 *    against a real Postgres instance with the full prior schema present —
 *    the only way to verify MV SQL correctness, since none of it can be
 *    unit-tested. Builds one small, realistic fixture (a student with a
 *    POSTED receipt today, a wallet, and an overdue unpaid invoice; two
 *    real GL journals posted through `PostingService.post()` — one
 *    doubling as the receipt's own `journal_id`, the other purely to
 *    populate an EXPENSE-class `gl_period_account_total` row) that
 *    exercises every join in every view, then refreshes + queries all 5
 *    through the real `MaterializedViewsRepository` and asserts the
 *    aggregated numbers are exactly what the fixture implies.
 */
describe("reporting module — foundation (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[reporting-foundation.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it.each([
    ["rpt_saved_params", RptSavedParamsEntity],
    ["rpt_schedule", RptScheduleEntity],
    ["rpt_export_job", RptExportJobEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[reporting-foundation.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it(
    "all 5 materialized views refresh and query correctly against a realistic cross-module fixture",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[reporting-foundation.integration.spec] SKIPPED (no DB) — materialized views check");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();
      const mvRepo = new MaterializedViewsRepository(source);

      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
        new GlAccountRepository(source.getRepository(GlAccountEntity)),
        new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
        new NumberingService(
          // Same stand-in precedent as accounting/__tests__/posting.integration.spec.ts —
          // allocate() never touches either dependency for a fresh GL_JOURNAL series.
          {} as ConstructorParameters<typeof NumberingService>[0],
          {} as ConstructorParameters<typeof NumberingService>[1],
        ),
      );

      const today = new Date().toISOString().slice(0, 10);
      const overdueDueDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const cashierId = generateUuidV7();
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      const costCenterId = generateUuidV7();
      const cashAccountId = generateUuidV7();
      const incomeAccountId = generateUuidV7();
      const expenseAccountId = generateUuidV7();
      const receiptId = generateUuidV7();
      const splitId = generateUuidV7();
      const invoiceId = generateUuidV7();
      const walletId = generateUuidV7();

      try {
        // --- Cross-module fixture setup ---------------------------------
        await source.query(
          `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2026-01-01', '2026-12-31')`,
          [academicYearId, `RPT-AY-${suffix}`],
        );
        await source.query(
          `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on) VALUES ($1, $2, 'Term 1', 1, '2026-01-01', '2026-04-30')`,
          [termId, academicYearId],
        );
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
          classId,
          `RPT-CLASS-${suffix}`,
        ]);
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Reporting', 'Fixture', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [studentId, `RPT-ADM-${suffix}`, classId],
        );
        // ck_usr_user_contact_or_parent (migration 0010) requires a non-PARENT user_type row to
        // have a phone or email — this is a STAFF user (the default user_type), so supply an email.
        await source.query(
          `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, email) VALUES ($1, $2, 'x', 'Reporting Cashier', 'ACTIVE', $3)`,
          [cashierId, `rpt-cashier-${suffix}`, `rpt-cashier-${suffix}@example.test`],
        );

        await source.query(
          `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
          [fiscalYearId, `RPT-FY-${suffix}`],
        );
        await source.query(
          `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2026-01-01', '2026-12-31', 'OPEN')`,
          [periodId, fiscalYearId],
        );
        await source.query(
          `INSERT INTO app.gl_cost_center (id, code, name, is_active) VALUES ($1, $2, 'Reporting Test CC', true)`,
          [costCenterId, `RPT-CC-${suffix}`],
        );
        const [rptAssetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
        const [rptIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
        const [rptExpenseParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '5000'`);
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPT Cash', 'ASSET', $3, true, false, true)`,
          [cashAccountId, `RPT-CASH-${String(suffix).slice(-8)}`, rptAssetsParent?.id ?? null],
        );
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPT Income', 'INCOME', $3, true, false, true)`,
          [incomeAccountId, `RPT-INC-${String(suffix).slice(-8)}`, rptIncomeParent?.id ?? null],
        );
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPT Expense', 'EXPENSE', $3, true, false, true)`,
          [expenseAccountId, `RPT-EXP-${String(suffix).slice(-8)}`, rptExpenseParent?.id ?? null],
        );

        // Journal 1 — the receipt's own journal (debit Cash 500 / credit Income 500);
        // doubles as the fixture for mv_income_expense's INCOME row.
        const receiptJournal = await runInTransaction(source, (manager) =>
          postingService.post(manager, {
            journalDate: today,
            periodId,
            sourceModule: "TEST",
            narration: "reporting foundation test — receipt journal",
            journalType: "MANUAL",
            postedBy: cashierId,
            lines: [
              { accountId: cashAccountId, costCenterId, debit: Money.fromInt(500), credit: Money.ZERO },
              { accountId: incomeAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(500) },
            ],
          }),
        );

        // Journal 2 — populates an EXPENSE-class gl_period_account_total row (debit Expense 200 / credit Cash 200).
        await runInTransaction(source, (manager) =>
          postingService.post(manager, {
            journalDate: today,
            periodId,
            sourceModule: "TEST",
            narration: "reporting foundation test — expense journal",
            journalType: "MANUAL",
            postedBy: cashierId,
            lines: [
              { accountId: expenseAccountId, costCenterId, debit: Money.fromInt(200), credit: Money.ZERO },
              { accountId: cashAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(200) },
            ],
          }),
        );

        await source.query(
          `INSERT INTO app.pay_receipt
             (id, number, student_id, payer_name, receipt_date, total, status, cashier_id, journal_id, balance_after, reprint_count)
           VALUES ($1, $2, $3, 'Reporting Parent', $4, 500.00, 'POSTED', $5, $6, 0.00, 0)`,
          [receiptId, `RPT-RCT-${suffix}`, studentId, today, cashierId, receiptJournal.id],
        );
        await source.query(
          `INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 500.00)`,
          [splitId, receiptId],
        );

        await source.query(
          `INSERT INTO app.bill_invoice
             (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
           VALUES ($1, $2, $3, $4, '2026-01-01', $5, 'POSTED', 'ADHOC', 300.00, 300.00, 300.00)`,
          [invoiceId, `RPT-INV-${suffix}`, studentId, termId, overdueDueDate],
        );

        await source.query(`INSERT INTO app.wall_wallet (id, student_id, status, balance) VALUES ($1, $2, 'ACTIVE', 1500.00)`, [
          walletId,
          studentId,
        ]);

        // --- Refresh all 5 views (proves CONCURRENTLY + the unique indexes work) ---
        await mvRepo.refreshAll();

        // --- mv_daily_collections -----------------------------------------
        const collections = await mvRepo.findDailyCollections();
        const collectionRow = collections.find((r) => r.cashierId === cashierId && r.method === "CASH");
        expect(collectionRow).toBeDefined();
        expect(collectionRow?.collectionDate.slice(0, 10)).toBe(today);
        expect(collectionRow?.amount.equals(Money.fromInt(500))).toBe(true);

        // --- mv_ar_summary (45 days overdue -> the 31-60 bucket) -----------
        const arSummary = await mvRepo.findArSummary();
        const arRow = arSummary.find((r) => r.classId === classId);
        expect(arRow).toBeDefined();
        expect(arRow?.agingBucket).toBe("31-60");
        expect(arRow?.balance.equals(Money.fromInt(300))).toBe(true);

        // --- mv_income_expense (one INCOME row, one EXPENSE row for this period) ---
        const incomeExpense = await mvRepo.findIncomeExpense();
        const incomeRow = incomeExpense.find((r) => r.periodId === periodId && r.accountClass === "INCOME");
        const expenseRow = incomeExpense.find((r) => r.periodId === periodId && r.accountClass === "EXPENSE");
        expect(incomeRow).toBeDefined();
        expect(incomeRow?.creditTotal.equals(Money.fromInt(500))).toBe(true);
        expect(incomeRow?.debitTotal.equals(Money.ZERO)).toBe(true);
        expect(expenseRow).toBeDefined();
        expect(expenseRow?.debitTotal.equals(Money.fromInt(200))).toBe(true);

        // --- mv_wallet_liability (single snapshot row, at least our 1500) --
        const walletLiability = await mvRepo.findWalletLiability();
        expect(walletLiability).not.toBeNull();
        expect(walletLiability?.totalBalance.compare(Money.fromInt(1500))).toBeGreaterThanOrEqual(0);

        // --- mv_defaulters (our overdue invoice's student) -----------------
        const defaulters = await mvRepo.findDefaulters();
        const defaulterRow = defaulters.find((r) => r.studentId === studentId);
        expect(defaulterRow).toBeDefined();
        expect(defaulterRow?.overdueAmount.equals(Money.fromInt(300))).toBe(true);
        expect(defaulterRow?.daysOverdue).toBeGreaterThanOrEqual(44);
      } finally {
        await source.query(`DELETE FROM app.wall_wallet WHERE id = $1`, [walletId]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
        // Deleting pay_receipt_split BEFORE its parent pay_receipt trips trg_pay_splits_sum
        // (migration 0080, deferred to COMMIT): with the split gone but the receipt row still
        // present, the recomputed split-sum (0) no longer matches receipt.total, so the trigger
        // rejects the delete. fk_pay_receipt_split_receipt_id is ON DELETE CASCADE, so deleting
        // the receipt alone removes the split in the same transaction — by the time the deferred
        // trigger checks, the receipt row is gone too, `v_receipt_total IS NULL`, and the check
        // short-circuits cleanly.
        await source.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [receiptId]);
        // This test posts real balanced journals against periodId (Journal 1/2, per this file's
        // own comments above), so gl_journal_line/gl_journal are permanently immutable
        // (trg_gl_journal_immutable, BR-GEN-03 — confirmed by direct testing: DELETE is rejected
        // unconditionally, even under application_name='kfe-posting-service'). That transitively
        // blocks every downstream delete below: gl_period_account_total is writer-guarded
        // (trg_gl_writer_guard) AND would need deleting before gl_account/gl_period/gl_cost_center
        // could be (all ON DELETE RESTRICT), but gl_account/gl_period are ALSO directly referenced
        // by the now-permanent gl_journal_line/gl_journal rows (also RESTRICT), so none of this
        // chain can ever succeed once real postings exist. This fixture's names are uniquely
        // suffixed per run, so leaving these rows behind as inert residue doesn't break
        // re-runnability — same precedent as inventory-e2e.integration.spec.ts's inv_movement fix.
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [cashierId]);
        await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
        // Restore every view to its post-cleanup state so this test leaves no residue behind for later runs.
        await mvRepo.refreshAll();
      }
    },
    30_000,
  );
});
