import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §6 (`rpt_*` DDL) +
 * docs/phase-4/02-schema-platform-accounting.md §8 ("Materialized Views") —
 * Module 18 (Reporting Engine + Dashboard), **FOUNDATION PASS ONLY**
 * (docs/phase-5/PROGRESS.md): the 3 owned `rpt_*` tables plus the 5
 * Dashboard-feeding materialized views. The report catalogue, Dashboard KPI
 * service, export/CSV generation, and scheduling execution all land in
 * later passes.
 *
 * ## Part A — `rpt_*` tables
 *
 * Column shapes match `domains/reporting/domain/rpt-*.entity.ts` 1:1. Table
 * order: `rpt_saved_params` (FK `usr_user`) -> `rpt_schedule` (FK
 * `usr_user`) -> `rpt_export_job` (FK `usr_user`, `file_object`).
 *
 * ## Part B — the 5 materialized views
 *
 * Every view is created WITHOUT `WITH NO DATA` — i.e. populated immediately
 * at migration time (a deliberate choice: `REFRESH MATERIALIZED VIEW
 * CONCURRENTLY` refuses to run against a view that has never been
 * populated, so leaving these `WITH NO DATA` would force a mandatory
 * one-time non-concurrent `REFRESH` before the first `CONCURRENTLY` call
 * anywhere downstream could ever succeed — populating immediately, even
 * against what will typically be empty/near-empty source tables at
 * migration time, sidesteps that entirely: every view starts "populated"
 * with zero-or-few rows, and every subsequent refresh can always use
 * `CONCURRENTLY`). Each view carries a `CREATE UNIQUE INDEX` (required by
 * Postgres for `CONCURRENTLY` refresh) on the column combination that makes
 * every row of that view unique. See each view SELECT's own inline comment
 * for its exact grouping/simplification reasoning — the fullest versions of
 * these are documented on the corresponding
 * `domains/reporting/domain/mv-*.view-entity.ts` DTO classes and in
 * docs/phase-5/PROGRESS.md's Module 18 row.
 *
 * All 5 are `app`-schema materialized views over tables owned by OTHER
 * modules (`pay_receipt`/`pay_receipt_split` — payments; `bill_invoice`/
 * `std_student` — billing/students; `gl_period_account_total`/`gl_account`/
 * `gl_period` — accounting; `wall_wallet` — wallet). This is pure SQL
 * (raw `CREATE MATERIALIZED VIEW ... AS SELECT ...`), not TypeORM entity
 * relations, so none of it requires a `module-deps.json` import grant the
 * way application/service code would — see `domains/reporting`'s own entry
 * in that file for why its `mayImport` list stays deliberately narrow
 * despite this migration reading across 5 other modules' tables.
 *
 * ## Part C — refresh mechanism: deliberately NOT built here
 *
 * No DB-level `fn_refresh_all_mvs()` wrapper function is created by this
 * migration — a documented, deliberate omission (repeated on
 * `MaterializedViewsRepository`'s own class doc comment, which is the
 * actual refresh entry point for now): the 5 views need different refresh
 * cadences per the DDL's own table (60s / 60s / 5min / hourly / 5min), so a
 * single SQL function refreshing all 5 in lockstep would work against that
 * requirement rather than for it. The application-layer
 * `MaterializedViewsRepository.refresh(viewName)` (this module's
 * `infrastructure/` folder) issues `REFRESH MATERIALIZED VIEW CONCURRENTLY
 * app.<name>` directly, one view at a time — a future scheduler pass can
 * call it per-view on whatever per-view timer it needs, with no DB-level
 * indirection to keep in sync.
 *
 * `down()` drops the 5 views (Part B, reverse dependency order — none
 * actually depend on each other, so order doesn't strictly matter here, but
 * kept symmetric with `up()`) then the 3 tables (Part A, reverse FK order).
 */
export class CreateReportingTablesAndMvs0160 implements MigrationInterface {
  name = "CreateReportingTablesAndMvs1700000000160";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Part A: rpt_* tables --------------------------------------------
    await queryRunner.query(`
      CREATE TABLE app.rpt_saved_params (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        user_id uuid NOT NULL,
        report_code varchar(40) NOT NULL,
        name varchar(80) NOT NULL,
        params jsonb NOT NULL,
        CONSTRAINT fk_rpt_saved_params_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT uq_rpt_saved_params_user_report_name UNIQUE (user_id, report_code, name)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_rpt_saved_params_user ON app.rpt_saved_params (user_id)`);

    await queryRunner.query(`
      CREATE TABLE app.rpt_schedule (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        report_code varchar(40) NOT NULL,
        params jsonb NOT NULL,
        cron varchar(30) NOT NULL,
        recipients jsonb NOT NULL,
        format varchar(4) NOT NULL,
        owner_user_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        last_run_at timestamptz NULL,
        last_ok boolean NULL,
        CONSTRAINT fk_rpt_schedule_owner_user_id FOREIGN KEY (owner_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_rpt_schedule_format CHECK (format IN ('PDF','XLSX','CSV'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_rpt_schedule_owner ON app.rpt_schedule (owner_user_id)`);
    await queryRunner.query(
      `CREATE INDEX ix_rpt_schedule_active_p ON app.rpt_schedule (is_active) WHERE is_active = true`,
    );

    await queryRunner.query(`
      CREATE TABLE app.rpt_export_job (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        report_code varchar(40) NOT NULL,
        params jsonb NOT NULL,
        requested_by uuid NOT NULL,
        status varchar(10) NOT NULL,
        file_id uuid NULL,
        expires_at timestamptz NULL,
        CONSTRAINT fk_rpt_export_job_requested_by FOREIGN KEY (requested_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_rpt_export_job_file_id FOREIGN KEY (file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL,
        CONSTRAINT ck_rpt_export_job_status CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_rpt_export_job_requested_by ON app.rpt_export_job (requested_by)`);
    await queryRunner.query(`
      CREATE INDEX ix_rpt_export_job_status_p ON app.rpt_export_job (status) WHERE status IN ('QUEUED','RUNNING')
    `);

    // --- Part B: materialized views ---------------------------------------

    // mv_daily_collections — Dashboard "Today's Collection" KPI + trend chart, 60s cadence.
    // `pay_receipt` filtered to POSTED (excludes REVERSED) joined to its splits, grouped by
    // (date, method, cashier). Category dimension dropped — see this migration's own class
    // doc comment and MvDailyCollectionsRow's doc comment for the full reasoning.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW app.mv_daily_collections AS
      SELECT
        r.receipt_date AS collection_date,
        s.method AS method,
        r.cashier_id AS cashier_id,
        SUM(s.amount) AS amount
      FROM app.pay_receipt r
      JOIN app.pay_receipt_split s ON s.receipt_id = r.id
      WHERE r.status = 'POSTED'
      GROUP BY r.receipt_date, s.method, r.cashier_id
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_daily_collections ON app.mv_daily_collections (collection_date, method, cashier_id)
    `);

    // mv_ar_summary — Dashboard "Outstanding Fees" KPI + aging drill, 60s cadence.
    // Open (balance > 0, not VOID) bill_invoice rows joined to std_student for class_id,
    // bucketed by CURRENT_DATE - due_date. See MvArSummaryRow's doc comment for the
    // "not-yet-due invoices fold into the 0-30 bucket" judgement call.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW app.mv_ar_summary AS
      SELECT
        st.class_id AS class_id,
        CASE
          WHEN CURRENT_DATE - bi.due_date <= 30 THEN '0-30'
          WHEN CURRENT_DATE - bi.due_date <= 60 THEN '31-60'
          WHEN CURRENT_DATE - bi.due_date <= 90 THEN '61-90'
          ELSE '90+'
        END AS aging_bucket,
        SUM(bi.balance) AS balance
      FROM app.bill_invoice bi
      JOIN app.std_student st ON st.id = bi.student_id
      WHERE bi.balance > 0 AND bi.status <> 'VOID'
      GROUP BY st.class_id,
        CASE
          WHEN CURRENT_DATE - bi.due_date <= 30 THEN '0-30'
          WHEN CURRENT_DATE - bi.due_date <= 60 THEN '31-60'
          WHEN CURRENT_DATE - bi.due_date <= 90 THEN '61-90'
          ELSE '90+'
        END
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_ar_summary ON app.mv_ar_summary (class_id, aging_bucket)
    `);

    // mv_income_expense — Dashboard Income vs Expense chart, 5min cadence.
    // gl_period_account_total joined to gl_account (INCOME/EXPENSE only) and gl_period,
    // grouped by (period, account class). period_starts_on/ends_on carried through for
    // chart labeling (functionally dependent on period_id, included via GROUP BY).
    // Report-of-record income statements bypass this view and read gl_journal_line
    // directly (FR-RPT-008) — this MV exists purely for the Dashboard chart's first paint.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW app.mv_income_expense AS
      SELECT
        pat.period_id AS period_id,
        gp.starts_on AS period_starts_on,
        gp.ends_on AS period_ends_on,
        ga.class AS account_class,
        SUM(pat.debit_total) AS debit_total,
        SUM(pat.credit_total) AS credit_total
      FROM app.gl_period_account_total pat
      JOIN app.gl_account ga ON ga.id = pat.account_id
      JOIN app.gl_period gp ON gp.id = pat.period_id
      WHERE ga.class IN ('INCOME','EXPENSE')
      GROUP BY pat.period_id, gp.starts_on, gp.ends_on, ga.class
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_income_expense ON app.mv_income_expense (period_id, account_class)
    `);

    // mv_wallet_liability — Wallet KPI + recon cross-check, hourly cadence.
    // Single always-current snapshot row (no GROUP BY, so it always returns exactly one
    // row even against an empty wall_wallet table) — see MvWalletLiabilityRow's doc
    // comment for the full "snapshot, not a time series" limitation.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW app.mv_wallet_liability AS
      SELECT
        CURRENT_DATE AS snapshot_date,
        COALESCE(SUM(w.balance), 0) AS total_balance
      FROM app.wall_wallet w
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_wallet_liability ON app.mv_wallet_liability (snapshot_date)
    `);

    // mv_defaulters — Defaulters register first paint, 5min cadence.
    // Overdue (balance > 0, due_date < CURRENT_DATE, not VOID) bill_invoice rows joined
    // to std_student, grouped PER STUDENT (the DDL's own "student -> overdue, days"
    // shape) — Σ balance as overdue_amount, worst (MAX) days-overdue as the headline figure.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW app.mv_defaulters AS
      SELECT
        st.id AS student_id,
        st.admission_no AS admission_no,
        st.first_name AS first_name,
        st.last_name AS last_name,
        st.class_id AS class_id,
        SUM(bi.balance) AS overdue_amount,
        MAX(CURRENT_DATE - bi.due_date) AS days_overdue
      FROM app.bill_invoice bi
      JOIN app.std_student st ON st.id = bi.student_id
      WHERE bi.balance > 0 AND bi.due_date < CURRENT_DATE AND bi.status <> 'VOID'
      GROUP BY st.id, st.admission_no, st.first_name, st.last_name, st.class_id
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_defaulters ON app.mv_defaulters (student_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS app.mv_defaulters`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS app.mv_wallet_liability`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS app.mv_income_expense`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS app.mv_ar_summary`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS app.mv_daily_collections`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.rpt_export_job`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.rpt_schedule`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.rpt_saved_params`);
  }
}
