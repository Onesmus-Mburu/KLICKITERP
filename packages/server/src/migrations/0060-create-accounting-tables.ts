import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §8, `gl_*` DDL — the
 * accounting core (Module 7, **foundation pass only**: entities/repos/
 * migration/triggers; `PostingService`/chart-of-accounts management/period
 * close/budget approval/integrity sweep land in the next pass, per
 * docs/phase-5/PROGRESS.md). Columns match `accounting/domain/*.entity.ts`
 * 1:1. Table order follows the FK dependency chain: `gl_fiscal_year` (no
 * deps) -> `gl_period` (FK to fiscal year) -> `gl_account` (self-ref
 * `parent_id`, fine inline since Postgres allows a table to FK-reference
 * itself within its own `CREATE TABLE`) -> `gl_cost_center` (no deps) ->
 * `gl_journal` (FK to period, self-ref `reversal_of_id`) -> `gl_journal_line`
 * (FK to journal/account/cost center) -> `gl_period_account_total` (FK to
 * period/account/cost center) -> `gl_budget` (FK to fiscal year) ->
 * `gl_budget_line` (FK to budget/account/cost center) -> `gl_integrity_run`
 * (no deps).
 *
 * This is the most important migration in the system — five triggers
 * realize the financial-integrity invariants from
 * docs/phase-4/01-standards-and-migrations.md §5 rules 4-5 and
 * docs/phase-4/02-schema-platform-accounting.md's "Key invariants realized
 * at DB level" table:
 *
 * 1. `trg_gl_journal_balanced` — a `CONSTRAINT TRIGGER ... DEFERRABLE
 *    INITIALLY DEFERRED` on `gl_journal_line` (AFTER INSERT/UPDATE/DELETE,
 *    FOR EACH ROW) that, at COMMIT time, re-sums `debit`/`credit` for the
 *    affected `journal_id` and raises if they differ (BR-GEN-02). Exact
 *    `NUMERIC(18,4)` comparison, no float tolerance needed.
 * 2. `trg_gl_writer_guard` — `BEFORE INSERT OR UPDATE OR DELETE` on
 *    `gl_journal`, `gl_journal_line`, `gl_period_account_total`, rejecting
 *    unless `current_setting('application_name') = 'kfe-posting-service'`.
 *    **This means every write to these three tables — including from this
 *    migration's own future seed migrations (e.g. a CoA template row count
 *    check, or any `INSERT`-based fixture) and from `psql`/`kfe_migrate`
 *    itself — is rejected once this migration has run, unless the caller's
 *    session first runs `SET application_name = 'kfe-posting-service'`.**
 *    That's intentional defense-in-depth for the sole-GL-writer choke point
 *    (docs/phase-4/01-standards-and-migrations.md §1); flagged clearly in
 *    this pass's final report since a CoA seed template is still needed and
 *    will require that session-setting workaround.
 * 3. `trg_gl_period_open` — `BEFORE INSERT` on `gl_journal`, rejects when
 *    the referenced `gl_period.status = 'HARD_CLOSED'` (BR-GEN-04).
 * 4. `trg_gl_journal_immutable` — `BEFORE UPDATE OR DELETE` on `gl_journal`
 *    and `gl_journal_line`, unconditionally rejects (BR-GEN-03) — reversals
 *    are new journals, never edits.
 * 5. `trg_gl_account_deactivation_only` — `BEFORE DELETE` on `gl_account`,
 *    rejects when any `gl_journal_line` still references it (BR-ACC-01) —
 *    forces `is_active = false` instead of a hard delete.
 */
export class CreateAccountingTables0060 implements MigrationInterface {
  name = "CreateAccountingTables1700000000060";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.gl_fiscal_year (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(20) NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status varchar(10) NOT NULL,
        CONSTRAINT uq_gl_fiscal_year_name UNIQUE (name),
        CONSTRAINT ck_gl_fiscal_year_status CHECK (status IN ('OPEN','CLOSING','LOCKED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_period (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        fiscal_year_id uuid NOT NULL,
        seq int NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status varchar(15) NOT NULL,
        CONSTRAINT fk_gl_period_fiscal_year_id FOREIGN KEY (fiscal_year_id)
          REFERENCES app.gl_fiscal_year(id) ON DELETE RESTRICT,
        CONSTRAINT uq_gl_period_fiscal_year_id_seq UNIQUE (fiscal_year_id, seq),
        CONSTRAINT ck_gl_period_status CHECK (status IN ('OPEN','SOFT_CLOSED','HARD_CLOSED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_gl_period_dates ON app.gl_period (starts_on, ends_on)`);

    await queryRunner.query(`
      CREATE TABLE app.gl_account (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        code varchar(20) NOT NULL,
        name varchar(120) NOT NULL,
        class varchar(15) NOT NULL,
        parent_id uuid NULL,
        is_postable boolean NOT NULL,
        is_control boolean NOT NULL,
        control_domain varchar(20) NULL,
        is_active boolean NOT NULL DEFAULT true,
        tax_treatment varchar(20) NULL,
        CONSTRAINT uq_gl_account_code UNIQUE (code),
        CONSTRAINT fk_gl_account_parent_id FOREIGN KEY (parent_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_gl_account_class CHECK (class IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
        CONSTRAINT ck_gl_account_control_domain CHECK (
          control_domain IS NULL OR control_domain IN
            ('AR_STUDENT','AR_SPONSOR','AP_SUPPLIER','WALLET','INVENTORY','PAYROLL','PREPAYMENT','MPESA_CLEARING','TRANSFER_CLEARING')
        ),
        CONSTRAINT ck_gl_account_postable_needs_parent CHECK (is_postable = false OR parent_id IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_gl_account_parent_id ON app.gl_account (parent_id)`);
    await queryRunner.query(`CREATE INDEX ix_gl_account_class ON app.gl_account (class)`);

    await queryRunner.query(`
      CREATE TABLE app.gl_cost_center (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        code varchar(20) NOT NULL,
        name varchar(80) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_gl_cost_center_code UNIQUE (code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_journal (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        number varchar(30) NOT NULL,
        journal_date date NOT NULL,
        period_id uuid NOT NULL,
        source_module varchar(20) NOT NULL,
        source_doc_type varchar(30) NOT NULL,
        source_doc_id uuid NOT NULL,
        narration text NOT NULL,
        journal_type varchar(15) NOT NULL,
        reversal_of_id uuid NULL,
        approval_ref uuid NULL,
        posted_by uuid NOT NULL,
        posted_at timestamptz NOT NULL,
        CONSTRAINT uq_gl_journal_number UNIQUE (number),
        CONSTRAINT fk_gl_journal_period_id FOREIGN KEY (period_id)
          REFERENCES app.gl_period(id) ON DELETE RESTRICT,
        CONSTRAINT fk_gl_journal_reversal_of_id FOREIGN KEY (reversal_of_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_gl_journal_type CHECK (journal_type IN ('SYSTEM','MANUAL','REVERSING','CLOSING','OPENING'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_gl_journal_source ON app.gl_journal (source_doc_type, source_doc_id)`);
    await queryRunner.query(`CREATE INDEX ix_gl_journal_period_id ON app.gl_journal (period_id)`);
    await queryRunner.query(`CREATE INDEX ix_gl_journal_date ON app.gl_journal (journal_date)`);
    // Multi-year append-only table axis — BRIN per docs/phase-4/01-standards-and-migrations.md §6.
    await queryRunner.query(`CREATE INDEX ix_gl_journal_date_brin ON app.gl_journal USING BRIN (journal_date)`);

    await queryRunner.query(`
      CREATE TABLE app.gl_journal_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        journal_id uuid NOT NULL,
        line_no int NOT NULL,
        account_id uuid NOT NULL,
        cost_center_id uuid NULL,
        debit numeric(18,4) NOT NULL DEFAULT 0,
        credit numeric(18,4) NOT NULL DEFAULT 0,
        memo varchar(200) NULL,
        entity_ref_type varchar(30) NULL,
        entity_ref_id uuid NULL,
        CONSTRAINT fk_gl_journal_line_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE CASCADE,
        CONSTRAINT fk_gl_journal_line_account_id FOREIGN KEY (account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_gl_journal_line_cost_center_id FOREIGN KEY (cost_center_id)
          REFERENCES app.gl_cost_center(id) ON DELETE RESTRICT,
        CONSTRAINT ck_gl_journal_line_one_side CHECK ((debit = 0) <> (credit = 0)),
        CONSTRAINT ck_gl_journal_line_nonneg CHECK (debit >= 0 AND credit >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_gl_line_account_journal ON app.gl_journal_line (account_id, journal_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_gl_line_entity ON app.gl_journal_line (entity_ref_type, entity_ref_id)
        WHERE entity_ref_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_period_account_total (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        period_id uuid NOT NULL,
        account_id uuid NOT NULL,
        cost_center_id uuid NULL,
        debit_total numeric(18,4) NOT NULL DEFAULT 0,
        credit_total numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_gl_period_account_total_period_id FOREIGN KEY (period_id)
          REFERENCES app.gl_period(id) ON DELETE RESTRICT,
        CONSTRAINT fk_gl_period_account_total_account_id FOREIGN KEY (account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_gl_period_account_total_cost_center_id FOREIGN KEY (cost_center_id)
          REFERENCES app.gl_cost_center(id) ON DELETE RESTRICT,
        CONSTRAINT uq_gl_period_account_total_period_account_cc UNIQUE (period_id, account_id, cost_center_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_budget (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        fiscal_year_id uuid NOT NULL,
        name varchar(80) NOT NULL,
        version_label varchar(20) NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        CONSTRAINT fk_gl_budget_fiscal_year_id FOREIGN KEY (fiscal_year_id)
          REFERENCES app.gl_fiscal_year(id) ON DELETE RESTRICT,
        CONSTRAINT ck_gl_budget_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_gl_budget_active_p ON app.gl_budget (fiscal_year_id) WHERE status = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_budget_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        budget_id uuid NOT NULL,
        account_id uuid NOT NULL,
        cost_center_id uuid NULL,
        period_phasing jsonb NOT NULL,
        annual_amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_gl_budget_line_budget_id FOREIGN KEY (budget_id)
          REFERENCES app.gl_budget(id) ON DELETE CASCADE,
        CONSTRAINT fk_gl_budget_line_account_id FOREIGN KEY (account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_gl_budget_line_cost_center_id FOREIGN KEY (cost_center_id)
          REFERENCES app.gl_cost_center(id) ON DELETE RESTRICT,
        CONSTRAINT uq_gl_budget_line_budget_account_cc UNIQUE (budget_id, account_id, cost_center_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.gl_integrity_run (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        ran_at timestamptz NOT NULL,
        kind varchar(20) NOT NULL,
        ok boolean NOT NULL,
        findings jsonb NOT NULL
      )
    `);

    // --- Trigger 1: trg_gl_journal_balanced (BR-GEN-02) ------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_gl_journal_balanced() RETURNS trigger AS $$
      DECLARE
        v_journal_id uuid;
        v_debit_sum numeric(18,4);
        v_credit_sum numeric(18,4);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_journal_id := OLD.journal_id;
        ELSE
          v_journal_id := NEW.journal_id;
        END IF;

        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
          INTO v_debit_sum, v_credit_sum
          FROM app.gl_journal_line
          WHERE journal_id = v_journal_id;

        IF v_debit_sum <> v_credit_sum THEN
          RAISE EXCEPTION 'BR-GEN-02: journal % is not balanced (debit=%, credit=%)',
            v_journal_id, v_debit_sum, v_credit_sum
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_gl_journal_balanced
        AFTER INSERT OR UPDATE OR DELETE ON app.gl_journal_line
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_journal_balanced()
    `);

    // --- Trigger 2: trg_gl_writer_guard (sole-GL-writer choke point) -----
    await queryRunner.query(`
      CREATE FUNCTION app.fn_gl_writer_guard() RETURNS trigger AS $$
      BEGIN
        IF current_setting('application_name', true) IS DISTINCT FROM 'kfe-posting-service' THEN
          RAISE EXCEPTION 'gl_writer_guard: % on %.% is only permitted when application_name=kfe-posting-service (got %)',
            TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME, current_setting('application_name', true)
            USING ERRCODE = '42501';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_writer_guard
        BEFORE INSERT OR UPDATE OR DELETE ON app.gl_journal
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_writer_guard()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_writer_guard
        BEFORE INSERT OR UPDATE OR DELETE ON app.gl_journal_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_writer_guard()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_writer_guard
        BEFORE INSERT OR UPDATE OR DELETE ON app.gl_period_account_total
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_writer_guard()
    `);

    // --- Trigger 3: trg_gl_period_open (BR-GEN-04) ------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_gl_period_open() RETURNS trigger AS $$
      DECLARE
        v_status varchar(15);
      BEGIN
        SELECT status INTO v_status FROM app.gl_period WHERE id = NEW.period_id;
        IF v_status = 'HARD_CLOSED' THEN
          RAISE EXCEPTION 'BR-GEN-04: cannot post journal % into HARD_CLOSED period %',
            NEW.number, NEW.period_id
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_period_open
        BEFORE INSERT ON app.gl_journal
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_period_open()
    `);

    // --- Trigger 4: trg_gl_journal_immutable (BR-GEN-03) ------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_gl_journal_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'BR-GEN-03: %.% is immutable after insert — % not permitted (id=%)',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, OLD.id
          USING ERRCODE = '23514';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_journal_immutable
        BEFORE UPDATE OR DELETE ON app.gl_journal
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_journal_immutable()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_journal_immutable
        BEFORE UPDATE OR DELETE ON app.gl_journal_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_journal_immutable()
    `);

    // --- Trigger 5: gl_account deactivation-only guard (BR-ACC-01) -------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_gl_account_no_delete_with_postings() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM app.gl_journal_line WHERE account_id = OLD.id) THEN
          RAISE EXCEPTION 'BR-ACC-01: account % has postings and cannot be deleted — set is_active=false instead',
            OLD.id
            USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_gl_account_deactivation_only
        BEFORE DELETE ON app.gl_account
        FOR EACH ROW EXECUTE FUNCTION app.fn_gl_account_no_delete_with_postings()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_account_deactivation_only ON app.gl_account`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_gl_account_no_delete_with_postings()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_journal_immutable ON app.gl_journal_line`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_journal_immutable ON app.gl_journal`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_gl_journal_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_period_open ON app.gl_journal`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_gl_period_open()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_writer_guard ON app.gl_period_account_total`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_writer_guard ON app.gl_journal_line`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_writer_guard ON app.gl_journal`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_gl_writer_guard()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_gl_journal_balanced ON app.gl_journal_line`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_gl_journal_balanced()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_integrity_run`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_budget_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_budget`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_period_account_total`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_journal_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_journal`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_cost_center`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_account`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_period`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.gl_fiscal_year`);
  }
}
