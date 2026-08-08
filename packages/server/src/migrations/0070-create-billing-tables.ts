import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/03-schema-student-finance.md §3, `bill_*` DDL — Module 9
 * (Billing), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services
 * (invoice generation, bulk billing, concession/waiver approval workflow,
 * sponsor award allocation, credit/debit notes, refund vouchers, late fee
 * calculation, controllers, tests, seed) land in a later pass.
 *
 * **Table count / credit-debit-note split**: the task's DDL enumerates 16
 * conceptual entries, one of which ("`bill_credit_note` / `bill_debit_note`")
 * is realized here as FOUR real tables (`bill_credit_note`,
 * `bill_credit_note_line`, `bill_debit_note`, `bill_debit_note_line`) per
 * the task's own clarification — a credit note is always issued against one
 * `bill_invoice`, a debit note creates new charges directly against a
 * `std_student`, and each carries its own line table shaped like
 * `bill_invoice_line` (minus `concession_amount`, not meaningful on a note
 * line). Net: 19 physical tables in this migration.
 *
 * Table order follows the FK dependency chain: `bill_fee_category` (FK
 * `gl_account`) -> `bill_transport_route` (no deps) -> `bill_concession_scheme`
 * (FK `gl_account`) -> `bill_sponsor` (FK `file_object`) ->
 * `bill_late_fee_policy` (no deps) -> `bill_fee_structure` (FK
 * `set_academic_year`/`set_term`/`std_class`/`std_stream`/`std_fee_group`) ->
 * `bill_fee_structure_line` (FK structure/category) ->
 * `bill_student_optional_item` (FK student/term/category) -> `bill_invoice`
 * (FK student/term/structure/`gl_journal`) -> `bill_invoice_line` (FK
 * invoice/category) -> `bill_installment` (FK invoice) -> `bill_sponsor_award`
 * (FK sponsor/student/term) -> `bill_concession` (FK scheme/student/invoice/
 * invoice_line/sponsor_award/`gl_journal`) -> `bill_credit_note` (FK invoice/
 * `gl_journal`) -> `bill_credit_note_line` (FK credit_note/category) ->
 * `bill_debit_note` (FK student/`gl_journal`) -> `bill_debit_note_line` (FK
 * debit_note/category) -> `bill_refund_voucher` (FK student/`gl_journal`) ->
 * `bill_late_fee_batch` (FK policy).
 *
 * **`bill_fee_structure`'s expression unique index**
 * (`uq_bill_fee_structure_scope_version`) realizes the DDL's `uq(term_id,
 * class_id, coalesce-scope, version)` note: `stream_id`/`boarding`/
 * `fee_group_id` are all nullable scope dimensions, and plain Postgres
 * `UNIQUE` treats every `NULL` as distinct (NULL <> NULL), so a naive
 * `UNIQUE(term_id, class_id, stream_id, boarding, fee_group_id, version)`
 * would silently allow duplicate "no stream / no boarding / no fee group"
 * scope rows at the same version. `COALESCE(...)` collapses each NULL to a
 * fixed sentinel (the nil UUID for uuid columns, empty string for
 * `boarding`) so the index genuinely enforces uniqueness across every
 * NULL-scope combination too. TypeORM's `@Index` decorator cannot express a
 * `COALESCE(...)` expression index — `BillFeeStructureEntity` carries no
 * decorator for it, only a comment pointing here.
 *
 * **`bill_invoice`'s partial covering index** (`ix_bill_invoice_open_p`)
 * realizes `(due_date) INCLUDE (student_id, balance) WHERE balance > 0`
 * exactly as specified — `INCLUDE` isn't `@Index`-decorator-expressible
 * either, raw SQL here.
 *
 * Three triggers realize this pass's DB-layer invariants:
 * 1. `trg_bill_structure_immutable` (BR-BILL-03) — `BEFORE UPDATE OR DELETE`
 *    on `bill_fee_structure_line`, rejects the write when the parent
 *    `bill_fee_structure.status = 'PUBLISHED'`. Conditional (not
 *    unconditional like `trg_gl_journal_immutable`) because edits ARE
 *    legitimate while the parent structure is `DRAFT` — see
 *    `BillFeeStructureLineEntity`'s doc comment.
 * 2. `trg_bill_invoice_immutable` — `BEFORE UPDATE` on `bill_invoice`,
 *    rejects changes to `subtotal`/`concession_total`/`total`/
 *    `structure_version`/`fee_structure_id` once `OLD.status IN
 *    ('POSTED','PARTIALLY_PAID','PAID')`, but explicitly ALLOWS continued
 *    updates to `paid_amount`/`balance`/`status`/`version` (the
 *    payment-allocation path) — column-by-column `OLD`/`NEW` comparison,
 *    mirroring `trg_gl_journal_balanced`'s aggregate-comparison style but
 *    scoped per-column instead of per-sum.
 * 3. `trg_bill_installments_sum` (BR-BILL-05) — a `DEFERRABLE INITIALLY
 *    DEFERRED` constraint trigger on `bill_installment`
 *    (`AFTER INSERT OR UPDATE OR DELETE`), asserting `SUM(amount)` for the
 *    affected `invoice_id` equals that invoice's current `balance` at
 *    COMMIT — the exact deferred-aggregate-comparison pattern
 *    `trg_gl_journal_balanced` (migration `0060`) established for
 *    `gl_journal_line`.
 */
export class CreateBillingTables0070 implements MigrationInterface {
  name = "CreateBillingTables1700000000070";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bill_fee_category (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(60) NOT NULL,
        gl_income_account_id uuid NOT NULL,
        taxable boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        priority int NOT NULL DEFAULT 0,
        CONSTRAINT uq_bill_fee_category_name UNIQUE (name),
        CONSTRAINT fk_bill_fee_category_gl_income_account_id FOREIGN KEY (gl_income_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_transport_route (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(60) NOT NULL,
        amount numeric(18,4) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_bill_transport_route_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_concession_scheme (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(80) NOT NULL,
        kind varchar(12) NOT NULL,
        calc varchar(10) NOT NULL,
        value numeric(18,4) NOT NULL,
        category_scope uuid[] NULL,
        allows_stacking boolean NOT NULL DEFAULT false,
        gl_account_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_bill_concession_scheme_name UNIQUE (name),
        CONSTRAINT fk_bill_concession_scheme_gl_account_id FOREIGN KEY (gl_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_concession_scheme_kind CHECK (kind IN ('WAIVER','DISCOUNT','SCHOLARSHIP','BURSARY')),
        CONSTRAINT ck_bill_concession_scheme_calc CHECK (calc IN ('PERCENT','FIXED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_sponsor (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        contacts jsonb NOT NULL DEFAULT '{}'::jsonb,
        agreement_file_id uuid NULL,
        allows_cash_conversion boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_bill_sponsor_name UNIQUE (name),
        CONSTRAINT fk_bill_sponsor_agreement_file_id FOREIGN KEY (agreement_file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_late_fee_policy (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(80) NOT NULL,
        mode varchar(10) NOT NULL,
        params jsonb NOT NULL DEFAULT '{}'::jsonb,
        grace_days int NOT NULL DEFAULT 0,
        requires_approval boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_bill_late_fee_policy_name UNIQUE (name),
        CONSTRAINT ck_bill_late_fee_policy_mode CHECK (mode IN ('FLAT','PERCENT','TIERED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_fee_structure (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        academic_year_id uuid NOT NULL,
        term_id uuid NOT NULL,
        class_id uuid NOT NULL,
        stream_id uuid NULL,
        boarding varchar(10) NULL,
        fee_group_id uuid NULL,
        version int NOT NULL,
        status varchar(12) NOT NULL,
        published_at timestamptz NULL,
        published_by uuid NULL,
        CONSTRAINT fk_bill_fee_structure_academic_year_id FOREIGN KEY (academic_year_id)
          REFERENCES app.set_academic_year(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_fee_structure_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_fee_structure_class_id FOREIGN KEY (class_id)
          REFERENCES app.std_class(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_fee_structure_stream_id FOREIGN KEY (stream_id)
          REFERENCES app.std_stream(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_fee_structure_fee_group_id FOREIGN KEY (fee_group_id)
          REFERENCES app.std_fee_group(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_fee_structure_status CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
        CONSTRAINT ck_bill_fee_structure_boarding CHECK (boarding IS NULL OR boarding IN ('DAY','BOARDER'))
      )
    `);
    // Expression unique index — see class-level doc comment "bill_fee_structure's expression unique index".
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_bill_fee_structure_scope_version ON app.bill_fee_structure (
        term_id,
        class_id,
        COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(boarding, ''),
        COALESCE(fee_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
        version
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_fee_structure_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        fee_structure_id uuid NOT NULL,
        fee_category_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        is_optional boolean NOT NULL DEFAULT false,
        CONSTRAINT fk_bill_fee_structure_line_fee_structure_id FOREIGN KEY (fee_structure_id)
          REFERENCES app.bill_fee_structure(id) ON DELETE CASCADE,
        CONSTRAINT fk_bill_fee_structure_line_fee_category_id FOREIGN KEY (fee_category_id)
          REFERENCES app.bill_fee_category(id) ON DELETE RESTRICT,
        CONSTRAINT uq_bill_fee_structure_line_structure_category UNIQUE (fee_structure_id, fee_category_id),
        CONSTRAINT ck_bill_fee_structure_line_amount_nonneg CHECK (amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_student_optional_item (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        student_id uuid NOT NULL,
        term_id uuid NOT NULL,
        fee_category_id uuid NOT NULL,
        amount_override numeric(18,4) NULL,
        CONSTRAINT fk_bill_student_optional_item_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_student_optional_item_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_student_optional_item_fee_category_id FOREIGN KEY (fee_category_id)
          REFERENCES app.bill_fee_category(id) ON DELETE RESTRICT,
        CONSTRAINT uq_bill_student_optional_item_student_term_category UNIQUE (student_id, term_id, fee_category_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_invoice (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        student_id uuid NOT NULL,
        term_id uuid NOT NULL,
        fee_structure_id uuid NULL,
        structure_version int NULL,
        issue_date date NOT NULL,
        due_date date NOT NULL,
        status varchar(18) NOT NULL,
        source varchar(12) NOT NULL,
        subtotal numeric(18,4) NOT NULL,
        concession_total numeric(18,4) NOT NULL DEFAULT 0,
        total numeric(18,4) NOT NULL,
        paid_amount numeric(18,4) NOT NULL DEFAULT 0,
        balance numeric(18,4) NOT NULL,
        journal_id uuid NULL,
        void_reason text NULL,
        voided_by uuid NULL,
        CONSTRAINT uq_bill_invoice_number UNIQUE (number),
        CONSTRAINT fk_bill_invoice_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_invoice_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_invoice_fee_structure_id FOREIGN KEY (fee_structure_id)
          REFERENCES app.bill_fee_structure(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_invoice_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_invoice_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','PARTIALLY_PAID','PAID','VOID')),
        CONSTRAINT ck_bill_invoice_source CHECK (source IN ('STRUCTURE','ADHOC','RECURRING','DEBIT_NOTE')),
        CONSTRAINT ck_bill_invoice_due_after_issue CHECK (due_date >= issue_date),
        CONSTRAINT ck_bill_invoice_balance CHECK (balance = total - paid_amount),
        CONSTRAINT ck_bill_invoice_paid_amount_range CHECK (paid_amount >= 0 AND paid_amount <= total)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bill_invoice_student ON app.bill_invoice (student_id, status)`);
    // Partial covering index — INCLUDE isn't @Index-decorator-expressible, see class-level doc comment.
    await queryRunner.query(`
      CREATE INDEX ix_bill_invoice_open_p ON app.bill_invoice (due_date) INCLUDE (student_id, balance)
        WHERE balance > 0
    `);
    // BR-BILL-04 idempotency.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_bill_invoice_structure_p ON app.bill_invoice (student_id, term_id, fee_structure_id)
        WHERE source = 'STRUCTURE' AND status <> 'VOID'
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_invoice_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        invoice_id uuid NOT NULL,
        line_no int NOT NULL,
        fee_category_id uuid NOT NULL,
        description varchar(160) NOT NULL,
        amount numeric(18,4) NOT NULL,
        concession_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_bill_invoice_line_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE CASCADE,
        CONSTRAINT fk_bill_invoice_line_fee_category_id FOREIGN KEY (fee_category_id)
          REFERENCES app.bill_fee_category(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_invoice_line_amount_nonneg CHECK (amount >= 0),
        CONSTRAINT ck_bill_invoice_line_concession_le_amount CHECK (concession_amount <= amount)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_installment (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        invoice_id uuid NOT NULL,
        seq int NOT NULL,
        due_date date NOT NULL,
        amount numeric(18,4) NOT NULL,
        settled_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_bill_installment_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT uq_bill_installment_invoice_seq UNIQUE (invoice_id, seq),
        CONSTRAINT ck_bill_installment_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_sponsor_award (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        sponsor_id uuid NOT NULL,
        student_id uuid NOT NULL,
        term_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        category_scope uuid[] NULL,
        applied_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_bill_sponsor_award_sponsor_id FOREIGN KEY (sponsor_id)
          REFERENCES app.bill_sponsor(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_sponsor_award_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_sponsor_award_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_sponsor_award_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bill_sponsor_award_applied_le_amount CHECK (applied_amount <= amount)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_concession (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        kind varchar(12) NOT NULL,
        scheme_id uuid NULL,
        student_id uuid NOT NULL,
        invoice_id uuid NULL,
        invoice_line_id uuid NULL,
        sponsor_award_id uuid NULL,
        amount numeric(18,4) NOT NULL,
        reason text NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT fk_bill_concession_scheme_id FOREIGN KEY (scheme_id)
          REFERENCES app.bill_concession_scheme(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_concession_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_concession_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_concession_invoice_line_id FOREIGN KEY (invoice_line_id)
          REFERENCES app.bill_invoice_line(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_concession_sponsor_award_id FOREIGN KEY (sponsor_award_id)
          REFERENCES app.bill_sponsor_award(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_concession_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_concession_kind CHECK (kind IN ('WAIVER','DISCOUNT','SCHOLARSHIP','BURSARY')),
        CONSTRAINT ck_bill_concession_status CHECK (status IN ('PENDING_APPROVAL','APPROVED','POSTED','REJECTED')),
        CONSTRAINT ck_bill_concession_amount_positive CHECK (amount > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bill_concession_invoice ON app.bill_concession (invoice_id)`);
    await queryRunner.query(`CREATE INDEX ix_bill_concession_student ON app.bill_concession (student_id)`);

    await queryRunner.query(`
      CREATE TABLE app.bill_credit_note (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        invoice_id uuid NOT NULL,
        reason text NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        total numeric(18,4) NOT NULL,
        CONSTRAINT uq_bill_credit_note_number UNIQUE (number),
        CONSTRAINT fk_bill_credit_note_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_credit_note_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_credit_note_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')),
        CONSTRAINT ck_bill_credit_note_total_positive CHECK (total > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bill_credit_note_invoice ON app.bill_credit_note (invoice_id)`);

    await queryRunner.query(`
      CREATE TABLE app.bill_credit_note_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        credit_note_id uuid NOT NULL,
        line_no int NOT NULL,
        fee_category_id uuid NOT NULL,
        description varchar(160) NOT NULL,
        amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_bill_credit_note_line_credit_note_id FOREIGN KEY (credit_note_id)
          REFERENCES app.bill_credit_note(id) ON DELETE CASCADE,
        CONSTRAINT fk_bill_credit_note_line_fee_category_id FOREIGN KEY (fee_category_id)
          REFERENCES app.bill_fee_category(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_credit_note_line_amount_nonneg CHECK (amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_debit_note (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        student_id uuid NOT NULL,
        reason text NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        total numeric(18,4) NOT NULL,
        CONSTRAINT uq_bill_debit_note_number UNIQUE (number),
        CONSTRAINT fk_bill_debit_note_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_debit_note_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_debit_note_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')),
        CONSTRAINT ck_bill_debit_note_total_positive CHECK (total > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bill_debit_note_student ON app.bill_debit_note (student_id)`);

    await queryRunner.query(`
      CREATE TABLE app.bill_debit_note_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        debit_note_id uuid NOT NULL,
        line_no int NOT NULL,
        fee_category_id uuid NOT NULL,
        description varchar(160) NOT NULL,
        amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_bill_debit_note_line_debit_note_id FOREIGN KEY (debit_note_id)
          REFERENCES app.bill_debit_note(id) ON DELETE CASCADE,
        CONSTRAINT fk_bill_debit_note_line_fee_category_id FOREIGN KEY (fee_category_id)
          REFERENCES app.bill_fee_category(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_debit_note_line_amount_nonneg CHECK (amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_refund_voucher (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        student_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        method varchar(10) NOT NULL,
        payee jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        b2c_transaction_id uuid NULL,
        CONSTRAINT uq_bill_refund_voucher_number UNIQUE (number),
        CONSTRAINT fk_bill_refund_voucher_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_refund_voucher_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_refund_voucher_method CHECK (method IN ('CASH','BANK','MPESA_B2C')),
        CONSTRAINT ck_bill_refund_voucher_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','APPROVED_UNPAID','PAID','CANCELLED')),
        CONSTRAINT ck_bill_refund_voucher_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bill_late_fee_batch (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        policy_id uuid NOT NULL,
        run_date date NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT fk_bill_late_fee_batch_policy_id FOREIGN KEY (policy_id)
          REFERENCES app.bill_late_fee_policy(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_late_fee_batch_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','POSTED'))
      )
    `);

    // --- Trigger 1: trg_bill_structure_immutable (BR-BILL-03) -------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bill_structure_immutable() RETURNS trigger AS $$
      DECLARE
        v_status varchar(12);
      BEGIN
        SELECT status INTO v_status FROM app.bill_fee_structure WHERE id = OLD.fee_structure_id;
        IF v_status = 'PUBLISHED' THEN
          RAISE EXCEPTION 'BR-BILL-03: fee structure % is PUBLISHED — line % is immutable, supersede with a new version instead',
            OLD.fee_structure_id, OLD.id
            USING ERRCODE = '23514';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bill_structure_immutable
        BEFORE UPDATE OR DELETE ON app.bill_fee_structure_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_bill_structure_immutable()
    `);

    // --- Trigger 2: trg_bill_invoice_immutable -----------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bill_invoice_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('POSTED','PARTIALLY_PAID','PAID') THEN
          IF NEW.subtotal <> OLD.subtotal
             OR NEW.concession_total <> OLD.concession_total
             OR NEW.total <> OLD.total
             OR NEW.structure_version IS DISTINCT FROM OLD.structure_version
             OR NEW.fee_structure_id IS DISTINCT FROM OLD.fee_structure_id THEN
            RAISE EXCEPTION 'BR-BILL: invoice % financial columns are frozen once status=% — only paid_amount/balance/status/version may change',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bill_invoice_immutable
        BEFORE UPDATE ON app.bill_invoice
        FOR EACH ROW EXECUTE FUNCTION app.fn_bill_invoice_immutable()
    `);

    // --- Trigger 3: trg_bill_installments_sum (BR-BILL-05) ----------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bill_installments_sum() RETURNS trigger AS $$
      DECLARE
        v_invoice_id uuid;
        v_installment_sum numeric(18,4);
        v_invoice_balance numeric(18,4);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_invoice_id := OLD.invoice_id;
        ELSE
          v_invoice_id := NEW.invoice_id;
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_installment_sum
          FROM app.bill_installment
          WHERE invoice_id = v_invoice_id;

        SELECT balance INTO v_invoice_balance FROM app.bill_invoice WHERE id = v_invoice_id;

        IF v_invoice_balance IS NOT NULL AND v_installment_sum <> v_invoice_balance THEN
          RAISE EXCEPTION 'BR-BILL-05: installment plan for invoice % sums to % but invoice balance is %',
            v_invoice_id, v_installment_sum, v_invoice_balance
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_bill_installments_sum
        AFTER INSERT OR UPDATE OR DELETE ON app.bill_installment
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION app.fn_bill_installments_sum()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bill_installments_sum ON app.bill_installment`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bill_installments_sum()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bill_invoice_immutable ON app.bill_invoice`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bill_invoice_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bill_structure_immutable ON app.bill_fee_structure_line`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bill_structure_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_late_fee_batch`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_refund_voucher`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_debit_note_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_debit_note`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_credit_note_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_credit_note`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_concession`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_sponsor_award`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_installment`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_invoice_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_invoice`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_student_optional_item`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_fee_structure_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_fee_structure`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_late_fee_policy`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_sponsor`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_concession_scheme`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_transport_route`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_fee_category`);
  }
}
