import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §4, the `pyrl_*` DDL — Module 15
 * (Payroll), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services
 * (employee/structure/component/loan management, statutory computation
 * engine, run lifecycle, controllers, tests, the real statutory rate seed)
 * land in later passes.
 *
 * **Table count**: 13 physical tables — `pyrl_employee`, `pyrl_component`,
 * `pyrl_salary_structure`, `pyrl_structure_component`,
 * `pyrl_employee_assignment`, `pyrl_employee_component`,
 * `pyrl_statutory_table`, `pyrl_loan`, `pyrl_loan_schedule`, `pyrl_run`,
 * `pyrl_run_line`, `pyrl_run_line_component`, `pyrl_oneoff`.
 *
 * Requires the `btree_gist` extension, enabled by migration `0125`
 * (`EnableBtreeGist0125`), run BEFORE this one.
 *
 * Table order follows the FK dependency chain: `pyrl_employee` (FK
 * `usr_user`/`usr_department`/`gl_cost_center`) -> `pyrl_component` (FK
 * `gl_account`) -> `pyrl_salary_structure` (no deps) ->
 * `pyrl_structure_component` (FK `pyrl_salary_structure`/`pyrl_component`)
 * -> `pyrl_employee_assignment` (FK `pyrl_employee`/`pyrl_salary_structure`)
 * -> `pyrl_employee_component` (FK `pyrl_employee`/`pyrl_component`) ->
 * `pyrl_statutory_table` (no deps) -> `pyrl_loan` (FK `pyrl_employee`) ->
 * `pyrl_loan_schedule` (FK `pyrl_loan`) -> `pyrl_run` (FK self/`usr_user`/
 * `gl_journal`) -> `pyrl_run_line` (FK `pyrl_run`/`pyrl_employee`/
 * `file_object`) -> `pyrl_run_line_component` (FK `pyrl_run_line`/
 * `pyrl_component`) -> `pyrl_oneoff` (FK `pyrl_employee`/`pyrl_component`).
 *
 * **Two `EXCLUDE USING gist` no-overlap constraints** (TypeORM decorators
 * cannot express these — see each entity's own doc comment):
 * 1. `excl_pyrl_employee_assignment_no_overlap` on `pyrl_employee_assignment`
 *    — `EXCLUDE USING gist (employee_id WITH =, daterange(effective_from,
 *    effective_to, '[]') WITH &&)`: an employee holds at most ONE active
 *    salary-structure assignment at any date.
 * 2. `excl_pyrl_employee_component_no_overlap` on `pyrl_employee_component`
 *    — scoped to `(employee_id, component_id)`, NOT `employee_id` alone (a
 *    documented judgement call — see `PyrlEmployeeComponentEntity`'s doc
 *    comment for why a literal `employee_id`-only copy of pattern 1 would
 *    be wrong here): `EXCLUDE USING gist (employee_id WITH =, component_id
 *    WITH =, daterange(effective_from, effective_to, '[]') WITH &&)`.
 *
 * Two triggers realize this pass's DB-layer invariants:
 * 1. `trg_pyrl_run_immutable` (BR-PYRL-06) — `BEFORE UPDATE` on `pyrl_run`,
 *    once `OLD.status` has EVER reached `COMMITTED`/`PAID`/`FILED`, freezes
 *    `totals`/`period_key`/`run_kind`/`journal_id` — `status`/
 *    `committed_at`/`approved_by`/`version` remain writable (a committed
 *    run still progresses to `PAID`/`FILED`).
 * 2. `trg_pyrl_run_line_immutable` (BR-PYRL-06, line-level) — `BEFORE
 *    UPDATE` on `pyrl_run_line`, once the PARENT `pyrl_run.status` has
 *    reached `COMMITTED` or beyond, freezes every financial/identity column
 *    except `payslip_file_id`/`paid_via`/`paid_at` (filled in AFTER commit,
 *    during the `PAID` transition).
 *
 * No `trg_gl_writer_guard`-style `application_name`-checking trigger is
 * added — same judgement call every prior module this size has made
 * (single-writer-service discipline at the application layer is deemed
 * sufficient; the next pass's run-lifecycle service is the sole intended
 * writer of `pyrl_run`/`pyrl_run_line`/`pyrl_run_line_component`).
 */
export class CreatePayrollTables0130 implements MigrationInterface {
  name = "CreatePayrollTables1700000000130";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.pyrl_employee (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        staff_no varchar(20) NOT NULL,
        user_id uuid NULL,
        full_name varchar(120) NOT NULL,
        national_id varchar(20) NOT NULL,
        kra_pin varchar(15) NOT NULL,
        nssf_no varchar(20) NULL,
        shif_no varchar(20) NULL,
        employment_type varchar(12) NOT NULL,
        department_id uuid NOT NULL,
        job_title varchar(80) NOT NULL,
        hire_date date NOT NULL,
        exit_date date NULL,
        pay_details jsonb NULL,
        bank_name jsonb NULL,
        branch jsonb NULL,
        account jsonb NULL,
        cost_center_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_pyrl_employee_staff_no UNIQUE (staff_no),
        CONSTRAINT fk_pyrl_employee_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_employee_department_id FOREIGN KEY (department_id)
          REFERENCES app.usr_department(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_employee_cost_center_id FOREIGN KEY (cost_center_id)
          REFERENCES app.gl_cost_center(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_employee_employment_type CHECK
          (employment_type IN ('PERMANENT','CONTRACT','CASUAL','PART_TIME'))
      )
    `);
    // DDL's own `ix: GIN trgm(full_name)` — pg_trgm enabled in migration 0001, whose own doc comment already names pyrl_* as a future consumer.
    await queryRunner.query(`
      CREATE INDEX ix_pyrl_employee_full_name_trgm ON app.pyrl_employee USING GIN (full_name gin_trgm_ops)
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_component (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        code varchar(20) NOT NULL,
        name varchar(120) NOT NULL,
        kind varchar(10) NOT NULL,
        is_taxable boolean NOT NULL,
        is_statutory boolean NOT NULL DEFAULT false,
        gl_account_id uuid NOT NULL,
        CONSTRAINT uq_pyrl_component_code UNIQUE (code),
        CONSTRAINT fk_pyrl_component_gl_account_id FOREIGN KEY (gl_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_component_kind CHECK (kind IN ('EARNING','DEDUCTION'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_salary_structure (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        grade varchar(30) NULL,
        effective_from date NOT NULL,
        CONSTRAINT uq_pyrl_salary_structure_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_structure_component (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        structure_id uuid NOT NULL,
        component_id uuid NOT NULL,
        amount numeric(18,4) NULL,
        formula jsonb NULL,
        CONSTRAINT fk_pyrl_structure_component_structure_id FOREIGN KEY (structure_id)
          REFERENCES app.pyrl_salary_structure(id) ON DELETE CASCADE,
        CONSTRAINT fk_pyrl_structure_component_component_id FOREIGN KEY (component_id)
          REFERENCES app.pyrl_component(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_structure_component_amount_or_formula CHECK
          (amount IS NOT NULL OR formula IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_pyrl_structure_component_structure ON app.pyrl_structure_component (structure_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE app.pyrl_employee_assignment (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        employee_id uuid NOT NULL,
        structure_id uuid NOT NULL,
        basic_pay numeric(18,4) NOT NULL,
        effective_from date NOT NULL,
        effective_to date NULL,
        CONSTRAINT fk_pyrl_employee_assignment_employee_id FOREIGN KEY (employee_id)
          REFERENCES app.pyrl_employee(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_employee_assignment_structure_id FOREIGN KEY (structure_id)
          REFERENCES app.pyrl_salary_structure(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_employee_assignment_dates CHECK
          (effective_to IS NULL OR effective_to >= effective_from),
        CONSTRAINT excl_pyrl_employee_assignment_no_overlap EXCLUDE USING gist (
          employee_id WITH =,
          daterange(effective_from, effective_to, '[]') WITH &&
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_employee_component (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        employee_id uuid NOT NULL,
        component_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        effective_from date NOT NULL,
        effective_to date NULL,
        CONSTRAINT fk_pyrl_employee_component_employee_id FOREIGN KEY (employee_id)
          REFERENCES app.pyrl_employee(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_employee_component_component_id FOREIGN KEY (component_id)
          REFERENCES app.pyrl_component(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_employee_component_dates CHECK
          (effective_to IS NULL OR effective_to >= effective_from),
        CONSTRAINT excl_pyrl_employee_component_no_overlap EXCLUDE USING gist (
          employee_id WITH =,
          component_id WITH =,
          daterange(effective_from, effective_to, '[]') WITH &&
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_statutory_table (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        kind varchar(6) NOT NULL,
        effective_from date NOT NULL,
        params jsonb NOT NULL,
        source_note text NOT NULL,
        CONSTRAINT uq_pyrl_statutory_table_kind_effective_from UNIQUE (kind, effective_from),
        CONSTRAINT ck_pyrl_statutory_table_kind CHECK (kind IN ('PAYE','NSSF','SHIF','AHL'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_loan (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        employee_id uuid NOT NULL,
        principal numeric(18,4) NOT NULL,
        rate numeric(9,6) NOT NULL,
        rate_kind varchar(10) NOT NULL,
        term_months int NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        balance numeric(18,4) NOT NULL,
        CONSTRAINT uq_pyrl_loan_number UNIQUE (number),
        CONSTRAINT fk_pyrl_loan_employee_id FOREIGN KEY (employee_id)
          REFERENCES app.pyrl_employee(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_loan_rate_kind CHECK (rate_kind IN ('FLAT','REDUCING')),
        CONSTRAINT ck_pyrl_loan_status CHECK
          (status IN ('PENDING_APPROVAL','ACTIVE','SETTLED','WRITTEN_OFF'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_pyrl_loan_employee ON app.pyrl_loan (employee_id)`);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_loan_schedule (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        loan_id uuid NOT NULL,
        seq int NOT NULL,
        due_period varchar(7) NOT NULL,
        principal_due numeric(18,4) NOT NULL,
        interest_due numeric(18,4) NOT NULL,
        recovered_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_pyrl_loan_schedule_loan_id FOREIGN KEY (loan_id)
          REFERENCES app.pyrl_loan(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_pyrl_loan_schedule_loan ON app.pyrl_loan_schedule (loan_id)`);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_run (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        period_key varchar(7) NOT NULL,
        run_kind varchar(15) NOT NULL,
        supplements_run_id uuid NULL,
        status varchar(18) NOT NULL,
        initiated_by uuid NOT NULL,
        approved_by uuid NULL,
        committed_at timestamptz NULL,
        journal_id uuid NULL,
        totals jsonb NOT NULL DEFAULT '{}',
        variance_report jsonb NULL,
        CONSTRAINT fk_pyrl_run_supplements_run_id FOREIGN KEY (supplements_run_id)
          REFERENCES app.pyrl_run(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_run_initiated_by FOREIGN KEY (initiated_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_run_approved_by FOREIGN KEY (approved_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_run_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_run_kind CHECK (run_kind IN ('MAIN','SUPPLEMENTARY')),
        CONSTRAINT ck_pyrl_run_status CHECK (status IN
          ('DRAFT','COMPUTED','REVIEW','PENDING_APPROVAL','APPROVED','COMMITTED','PAID','FILED'))
      )
    `);
    // DDL's own `uq_pyrl_main_run_p (period_key) WHERE run_kind='MAIN' AND status='COMMITTED'` — BR-PYRL-02.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_pyrl_main_run_p ON app.pyrl_run (period_key)
        WHERE run_kind = 'MAIN' AND status = 'COMMITTED'
    `);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_run_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        run_id uuid NOT NULL,
        employee_id uuid NOT NULL,
        gross numeric(18,4) NOT NULL,
        taxable numeric(18,4) NOT NULL,
        paye numeric(18,4) NOT NULL,
        nssf_employee numeric(18,4) NOT NULL,
        nssf_employer numeric(18,4) NOT NULL,
        shif numeric(18,4) NOT NULL,
        ahl_employee numeric(18,4) NOT NULL,
        ahl_employer numeric(18,4) NOT NULL,
        loan_recovered numeric(18,4) NOT NULL,
        other_deductions numeric(18,4) NOT NULL,
        net_pay numeric(18,4) NOT NULL,
        deferred_recovery numeric(18,4) NOT NULL DEFAULT 0,
        payslip_file_id uuid NULL,
        paid_via varchar(10) NULL,
        paid_at timestamptz NULL,
        CONSTRAINT uq_pyrl_run_line_run_employee UNIQUE (run_id, employee_id),
        CONSTRAINT fk_pyrl_run_line_run_id FOREIGN KEY (run_id)
          REFERENCES app.pyrl_run(id) ON DELETE CASCADE,
        CONSTRAINT fk_pyrl_run_line_employee_id FOREIGN KEY (employee_id)
          REFERENCES app.pyrl_employee(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_run_line_payslip_file_id FOREIGN KEY (payslip_file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL,
        CONSTRAINT ck_pyrl_run_line_paid_via CHECK
          (paid_via IS NULL OR paid_via IN ('BANK','MPESA_B2C','CASH'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_pyrl_run_line_run ON app.pyrl_run_line (run_id)`);

    await queryRunner.query(`
      CREATE TABLE app.pyrl_run_line_component (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        run_line_id uuid NOT NULL,
        component_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_pyrl_run_line_component_run_line_id FOREIGN KEY (run_line_id)
          REFERENCES app.pyrl_run_line(id) ON DELETE CASCADE,
        CONSTRAINT fk_pyrl_run_line_component_component_id FOREIGN KEY (component_id)
          REFERENCES app.pyrl_component(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_pyrl_run_line_component_run_line ON app.pyrl_run_line_component (run_line_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE app.pyrl_oneoff (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        employee_id uuid NOT NULL,
        period_key varchar(7) NOT NULL,
        kind varchar(10) NOT NULL,
        component_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        reason text NOT NULL,
        approval_ref uuid NULL,
        CONSTRAINT uq_pyrl_oneoff_employee_period_component UNIQUE (employee_id, period_key, component_id),
        CONSTRAINT fk_pyrl_oneoff_employee_id FOREIGN KEY (employee_id)
          REFERENCES app.pyrl_employee(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pyrl_oneoff_component_id FOREIGN KEY (component_id)
          REFERENCES app.pyrl_component(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pyrl_oneoff_kind CHECK (kind IN ('EARNING','DEDUCTION'))
      )
    `);

    // --- Trigger 1: trg_pyrl_run_immutable (BR-PYRL-06) ---------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_pyrl_run_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('COMMITTED','PAID','FILED') THEN
          IF NEW.totals IS DISTINCT FROM OLD.totals
             OR NEW.period_key <> OLD.period_key
             OR NEW.run_kind <> OLD.run_kind
             OR NEW.journal_id IS DISTINCT FROM OLD.journal_id THEN
            RAISE EXCEPTION 'BR-PYRL-06: payroll run % is immutable once status=% (COMMITTED or beyond) — totals/period_key/run_kind/journal_id cannot change; status/committed_at/approved_by may still progress',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_pyrl_run_immutable
        BEFORE UPDATE ON app.pyrl_run
        FOR EACH ROW EXECUTE FUNCTION app.fn_pyrl_run_immutable()
    `);

    // --- Trigger 2: trg_pyrl_run_line_immutable (BR-PYRL-06, line-level) ---
    await queryRunner.query(`
      CREATE FUNCTION app.fn_pyrl_run_line_immutable() RETURNS trigger AS $$
      DECLARE
        v_run_status varchar(18);
      BEGIN
        SELECT status INTO v_run_status FROM app.pyrl_run WHERE id = OLD.run_id;

        IF v_run_status IN ('COMMITTED','PAID','FILED') THEN
          IF NEW.run_id <> OLD.run_id
             OR NEW.employee_id <> OLD.employee_id
             OR NEW.gross <> OLD.gross
             OR NEW.taxable <> OLD.taxable
             OR NEW.paye <> OLD.paye
             OR NEW.nssf_employee <> OLD.nssf_employee
             OR NEW.nssf_employer <> OLD.nssf_employer
             OR NEW.shif <> OLD.shif
             OR NEW.ahl_employee <> OLD.ahl_employee
             OR NEW.ahl_employer <> OLD.ahl_employer
             OR NEW.loan_recovered <> OLD.loan_recovered
             OR NEW.other_deductions <> OLD.other_deductions
             OR NEW.net_pay <> OLD.net_pay
             OR NEW.deferred_recovery <> OLD.deferred_recovery THEN
            RAISE EXCEPTION 'BR-PYRL-06: payroll run line % is immutable once its parent run % has status=% (COMMITTED or beyond) — only payslip_file_id/paid_via/paid_at may still change',
              OLD.id, OLD.run_id, v_run_status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_pyrl_run_line_immutable
        BEFORE UPDATE ON app.pyrl_run_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_pyrl_run_line_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_pyrl_run_line_immutable ON app.pyrl_run_line`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_pyrl_run_line_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_pyrl_run_immutable ON app.pyrl_run`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_pyrl_run_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_oneoff`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_run_line_component`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_run_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_run`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_loan_schedule`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_loan`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_statutory_table`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_employee_component`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_employee_assignment`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_structure_component`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_salary_structure`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_component`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_employee`);
  }
}
