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
import { BillInvoiceEntity, BillInvoiceRepository } from "../../billing";
import { StdStudentEntity, StdStudentRepository } from "../../students";

import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";
import { TrialBalanceReport } from "../application/trial-balance.report";
import { IncomeStatementReport } from "../application/income-statement.report";
import { AgingOutstandingReport } from "../application/aging-outstanding.report";
import { CashFlowReport } from "../application/cash-flow.report";
import { DashboardKpisService } from "../application/dashboard-kpis.service";

/**
 * Module 18 (Reporting Engine + Dashboard) **PASS B** — the single most
 * important integration assertion in this whole module (FR-DASH-010.1:
 * "every figure reconciles to RPT equivalents"): builds a small, realistic
 * cross-module fixture, posts real GL journals via `PostingService.post()`,
 * executes the Trial Balance / Income Statement / Aging-Outstanding
 * report-of-record reports, REFRESHES the 5 materialized views, then reads
 * `DashboardKpisService`'s MV-backed figures and asserts they reconcile
 * exactly to the report-of-record equivalents for the SAME fixture data.
 * Self-skips (not fails) when no DB is reachable, same connectivity-probe
 * pattern as `reporting-foundation.integration.spec.ts` and every other
 * module's own integration spec.
 *
 * **Cash Flow's reconciliation is a structural smoke test only** —
 * `CashFlowReport`/`CashbookReport` deliberately resolve a HARDCODED set of
 * cash/bank account CODES (`1010`/`1020`/`1030`/`1040`, see
 * `DEFAULT_CASHBOOK_ACCOUNT_CODES`'s own doc comment), not this fixture's
 * own freshly-generated account ids — so `DashboardKpisService.getCashFlow()`
 * is asserted only to return a well-formed `ReportResult` without error
 * (whatever real cash/bank accounts a given database happens to have
 * seeded), not to a specific numeric fixture value; the Trial
 * Balance/Income Statement/Aging-Outstanding checks below are the real,
 * exact numeric reconciliations, using this module's own freshly-generated
 * (never code-hardcoded) accounts.
 */
describe("reporting module — Pass B end-to-end (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[reporting-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
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
    "Trial Balance / Income Statement / Aging-Outstanding report-of-record figures reconcile exactly to DashboardKpisService's MV-backed figures",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[reporting-e2e.integration.spec] SKIPPED (no DB) — reconciliation check");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const glPeriodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const glPeriodAccountTotalRepository = new GlPeriodAccountTotalRepository(
        source.getRepository(GlPeriodAccountTotalEntity),
      );
      const mvRepo = new MaterializedViewsRepository(source);

      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        glPeriodAccountTotalRepository,
        glAccountRepository,
        glPeriodRepository,
        new NumberingService(
          {} as ConstructorParameters<typeof NumberingService>[0],
          {} as ConstructorParameters<typeof NumberingService>[1],
        ),
      );

      const trialBalanceReport = new TrialBalanceReport(glPeriodRepository, glAccountRepository, glPeriodAccountTotalRepository);
      const incomeStatementReport = new IncomeStatementReport(glPeriodRepository, glAccountRepository, glPeriodAccountTotalRepository);
      const agingOutstandingReport = new AgingOutstandingReport(
        new BillInvoiceRepository(source.getRepository(BillInvoiceEntity)),
        new StdStudentRepository(source.getRepository(StdStudentEntity)),
      );
      const cashFlowReport = new CashFlowReport(glAccountRepository, source);
      const dashboardKpis = new DashboardKpisService(
        mvRepo,
        glPeriodRepository,
        glPeriodAccountTotalRepository,
        glAccountRepository,
        cashFlowReport,
        source,
      );

      const today = new Date().toISOString().slice(0, 10);
      const overdueDueDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const actorId = generateUuidV7();
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      const costCenterId = generateUuidV7();
      const cashAccountId = generateUuidV7();
      const incomeAccountId = generateUuidV7();
      const expenseAccountId = generateUuidV7();
      const invoiceId = generateUuidV7();

      try {
        await source.query(
          `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2026-01-01', '2026-12-31')`,
          [academicYearId, `RPTB-AY-${String(suffix).slice(-8)}`],
        );
        await source.query(
          `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on) VALUES ($1, $2, 'Term 1', 1, '2026-01-01', '2026-04-30')`,
          [termId, academicYearId],
        );
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `RPTB-CLASS-${suffix}`]);
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'PassB', 'Fixture', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [studentId, `RPTB-ADM-${suffix}`, classId],
        );
        // ck_usr_user_contact_or_parent (migration 0010) requires a non-PARENT user_type row to
        // have a phone or email — this is a STAFF user (the default user_type), so supply an email.
        await source.query(
          `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, email) VALUES ($1, $2, 'x', 'Pass B Actor', 'ACTIVE', $3)`,
          [actorId, `rptb-actor-${suffix}`, `rptb-actor-${suffix}@example.test`],
        );

        await source.query(
          `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
          [fiscalYearId, `RPTB-FY-${String(suffix).slice(-8)}`],
        );
        await source.query(
          `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2026-01-01', '2026-12-31', 'OPEN')`,
          [periodId, fiscalYearId],
        );
        await source.query(`INSERT INTO app.gl_cost_center (id, code, name, is_active) VALUES ($1, $2, 'RPTB CC', true)`, [
          costCenterId,
          `RPTB-CC-${String(suffix).slice(-8)}`,
        ]);
        // ck_gl_account_postable_needs_parent (migration 0060) requires is_postable=true rows to
        // have a real parent_id — hang these off the seeded top-level Assets/Income/Expense accounts.
        const [rptbAssetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
        const [rptbIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
        const [rptbExpenseParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '5000'`);
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPTB Cash', 'ASSET', $3, true, false, true)`,
          [cashAccountId, `RPTB-CASH-${String(suffix).slice(-8)}`, rptbAssetsParent?.id ?? null],
        );
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPTB Income', 'INCOME', $3, true, false, true)`,
          [incomeAccountId, `RPTB-INC-${String(suffix).slice(-8)}`, rptbIncomeParent?.id ?? null],
        );
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, 'RPTB Expense', 'EXPENSE', $3, true, false, true)`,
          [expenseAccountId, `RPTB-EXP-${String(suffix).slice(-8)}`, rptbExpenseParent?.id ?? null],
        );

        // Journal 1: debit Cash 700 / credit Income 700.
        await runInTransaction(source, (manager) =>
          postingService.post(manager, {
            journalDate: today,
            periodId,
            sourceModule: "TEST",
            narration: "reporting Pass B e2e — income journal",
            journalType: "MANUAL",
            postedBy: actorId,
            lines: [
              { accountId: cashAccountId, costCenterId, debit: Money.fromInt(700), credit: Money.ZERO },
              { accountId: incomeAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(700) },
            ],
          }),
        );
        // Journal 2: debit Expense 250 / credit Cash 250.
        await runInTransaction(source, (manager) =>
          postingService.post(manager, {
            journalDate: today,
            periodId,
            sourceModule: "TEST",
            narration: "reporting Pass B e2e — expense journal",
            journalType: "MANUAL",
            postedBy: actorId,
            lines: [
              { accountId: expenseAccountId, costCenterId, debit: Money.fromInt(250), credit: Money.ZERO },
              { accountId: cashAccountId, costCenterId, debit: Money.ZERO, credit: Money.fromInt(250) },
            ],
          }),
        );

        await source.query(
          `INSERT INTO app.bill_invoice
             (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
           VALUES ($1, $2, $3, $4, '2026-01-01', $5, 'POSTED', 'ADHOC', 450.00, 450.00, 450.00)`,
          [invoiceId, `RPTB-INV-${suffix}`, studentId, termId, overdueDueDate],
        );

        // --- Report-of-record figures ---------------------------------
        const trialBalance = await trialBalanceReport.execute({ periodId });
        expect(trialBalance.totals!.balanced).toBe(true);
        const cashRow = trialBalance.rows.find((r) => r.accountId === cashAccountId) as { debit: Money; credit: Money };
        expect(cashRow.debit.toDecimalString()).toBe("700.0000");
        expect(cashRow.credit.toDecimalString()).toBe("250.0000");

        const incomeStatement = await incomeStatementReport.execute({ fromPeriodId: periodId, toPeriodId: periodId });
        const isIncomeRow = incomeStatement.rows.find((r) => r.accountId === incomeAccountId) as { amount: Money };
        const isExpenseRow = incomeStatement.rows.find((r) => r.accountId === expenseAccountId) as { amount: Money };
        expect(isIncomeRow.amount.toDecimalString()).toBe("700.0000");
        expect(isExpenseRow.amount.toDecimalString()).toBe("250.0000");

        const aging = await agingOutstandingReport.execute({ asOfDate: today });
        const agingRow = aging.rows.find((r) => r.studentId === studentId) as { total: Money };
        expect(agingRow.total.toDecimalString()).toBe("450.0000");

        // --- Refresh the MVs, then reconcile Dashboard's figures against the above ---
        await mvRepo.refreshAll();

        const revenueExpenseSurplus = await dashboardKpis.getRevenueExpenseSurplus(periodId);
        expect(revenueExpenseSurplus.revenue.toDecimalString()).toBe(isIncomeRow.amount.toDecimalString());
        expect(revenueExpenseSurplus.expense.toDecimalString()).toBe(isExpenseRow.amount.toDecimalString());
        expect(revenueExpenseSurplus.surplus.toDecimalString()).toBe(
          isIncomeRow.amount.subtract(isExpenseRow.amount).toDecimalString(),
        );

        const outstandingFees = await dashboardKpis.getOutstandingFees();
        // Our fixture's overdue invoice must be reflected somewhere in the MV's aggregate —
        // a global-total equality assertion would be flaky against a populated DB, so this
        // reconciles at the per-class granularity mv_ar_summary itself groups by.
        const arSummaryRows = await mvRepo.findArSummary();
        const arRow = arSummaryRows.find((r) => r.classId === classId);
        expect(arRow).toBeDefined();
        expect(arRow!.balance.toDecimalString()).toBe(agingRow.total.toDecimalString());
        expect(outstandingFees.total.compare(arRow!.balance)).toBeGreaterThanOrEqual(0);

        // --- Cash Flow: structural smoke test only (hardcoded account codes, see class doc comment) ---
        const cashFlow = await dashboardKpis.getCashFlow(today, today);
        expect(Array.isArray(cashFlow.rows)).toBe(true);
        expect(cashFlow.totals).toHaveProperty("netCashFlow");
      } finally {
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
        // This test posts real balanced journals against periodId, so gl_journal_line/gl_journal
        // are permanently immutable (trg_gl_journal_immutable, BR-GEN-03 — DELETE unconditionally
        // rejected, confirmed by direct testing), which transitively blocks gl_period_account_total
        // (writer-guarded, and RESTRICT-referenced by gl_period/gl_account) and gl_account/gl_period
        // themselves (also directly RESTRICT-referenced by the permanent gl_journal_line/gl_journal
        // rows). Same precedent as reporting-foundation.integration.spec.ts's own GL cleanup fix —
        // uniquely-suffixed fixture names make leaving this residue behind safe for re-runs.
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [actorId]);
        await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
        await mvRepo.refreshAll();
      }
    },
    30_000,
  );
});
