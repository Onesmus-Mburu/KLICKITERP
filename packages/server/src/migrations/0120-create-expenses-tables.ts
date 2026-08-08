import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §4 (top half), the `exp_*` DDL —
 * Module 14 (Expenses), **foundation pass only**: entities/repositories/
 * migration/triggers (docs/phase-5/PROGRESS.md). Application-layer services
 * (expense voucher submission/approval/posting P-25, petty cash spend/
 * replenishment P-26, staff claims incl. PAYROLL/DIRECT reimbursement
 * routing, recurring expense templates, controllers, tests, seed) land in a
 * later pass.
 *
 * **Table count**: 8 physical tables — `exp_category`, `exp_voucher`,
 * `exp_petty_cash_float`, `exp_petty_cash_voucher`, `exp_replenishment`,
 * `exp_claim`, `exp_claim_line` (the DDL's inline "lines child" shorthand
 * for `exp_claim`), `exp_recurring`.
 *
 * Table order follows the FK dependency chain: `exp_category` (self-ref
 * `parent_id`, FK `gl_account`) -> `exp_voucher` (FK `exp_category`,
 * `gl_cost_center`, `gl_journal`) -> `exp_petty_cash_float` (FK `usr_user`)
 * -> `exp_petty_cash_voucher` (FK `exp_petty_cash_float`, `exp_category`,
 * `file_object`, `gl_journal`) -> `exp_replenishment` (FK
 * `exp_petty_cash_float`, `gl_journal`) -> `exp_claim` (FK `usr_user`) ->
 * `exp_claim_line` (FK `exp_claim`, `exp_category`, `file_object`) ->
 * `exp_recurring` (FK `exp_voucher`).
 *
 * **Two status-enum design decisions** (the DDL leaves these unspecified
 * beyond a bare "status"/"status incl. REIMBURSED"), documented in full on
 * the owning entity's own doc comment: `exp_petty_cash_voucher.status` ->
 * `DRAFT|PENDING_APPROVAL|APPROVED|CANCELLED` (see
 * `ExpPettyCashVoucherEntity`'s doc comment — no `PAID` state, since a
 * petty-cash spend IS paid the moment it clears approval, straight out of
 * the float balance); `exp_claim.status` ->
 * `DRAFT|PENDING_APPROVAL|APPROVED|REIMBURSED|REJECTED|CANCELLED` (see
 * `ExpClaimEntity`'s doc comment).
 *
 * **BR-EXP-01** ("every expense maps to a category with a GL account")'s
 * DB-layer half is `exp_category.gl_expense_account_id NOT NULL FK`; the
 * budget-line half (`budget_required`) is a service-layer concern for the
 * next pass. **BR-EXP-02** ("petty cash vouchers cannot exceed the
 * custodian's current float balance; replenishment restores at most to the
 * ceiling") is realized as `ck_exp_petty_cash_float_balance_range` (`balance
 * >= 0 AND balance <= ceiling`) — see `ExpPettyCashFloatEntity`'s own doc
 * comment. **BR-EXP-03** (attachment threshold) is explicitly a
 * service-layer concern (count-check against `file_object`, per the DDL's
 * own note) — no DB constraint here. **BR-EXP-04** (no self-approval) is
 * already generically enforced by `ApprovalEngineService`'s own
 * self-approval block (Module 6) — no new trigger needed for `exp_*`
 * specifically.
 *
 * **Three triggers** (mirroring `trg_bill_invoice_immutable`/
 * `trg_proc_po_immutable`'s column-by-column freeze pattern — a `BEFORE
 * UPDATE` function that only rejects the UPDATE when the OLD row has
 * already reached a frozen status AND specific NEW columns differ from
 * OLD, otherwise passes through unconditionally so status progression,
 * `journal_id`/`approval_ref` population, and `version` bumps always
 * succeed):
 * 1. `trg_exp_voucher_immutable` — freezes `amount`/`category_id`/
 *    `payee_type`/`payee_ref`/`method` once `status IN ('APPROVED','PAID')`
 *    — the exact column list the task brief names (a deliberately
 *    narrower-than-full-row scope, same judgement call
 *    `trg_proc_po_immutable`'s own doc comment documents: `narrative`/
 *    `cost_center_id`/`approval_ref` stay ordinarily writable even post-
 *    approval, e.g. late cost-center tagging or narrative correction).
 * 2. `trg_exp_petty_cash_voucher_immutable` — same shape on
 *    `exp_petty_cash_voucher`, once `status = 'APPROVED'` (its terminal
 *    financial state per the status-enum design decision above). Column
 *    list not spelled out by the task brief for this trigger, so chosen by
 *    analogy to trigger 1's financial/identity columns: `float_id`/
 *    `category_id`/`amount`/`receipt_file_id`.
 * 3. `trg_exp_claim_immutable` — same shape on `exp_claim`, once `status IN
 *    ('APPROVED','REIMBURSED')`. Column list chosen the same way:
 *    `staff_user_id`/`total`/`reimburse_via` (`approval_ref` stays writable
 *    — the workflow keeps populating it as the claim's approval instance
 *    progresses even after reaching APPROVED).
 *
 * **Deliberately NOT given a `trg_gl_writer_guard`-style `application_name`
 * gate**: same judgement call Wallet's migration `0090`/Inventory's
 * migration `0110` made for `wall_wallet`/`inv_stock_balance` (see either
 * migration's own doc comment for the full reasoning) —
 * `trg_gl_journal`'s writer-guard exists because MANY current and future
 * modules post into the *shared* GL tables, a genuine multi-module fan-in
 * problem; every `exp_*` table here will only ever be written by exactly
 * one future service in this codebase (the next pass's expenses
 * application layer), and TypeScript's module boundary (only
 * `expenses.module.ts`, not yet built, will register repository providers
 * for these entities) already makes a stray write structurally difficult.
 */
export class CreateExpensesTables0120 implements MigrationInterface {
  name = "CreateExpensesTables1700000000120";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.exp_category (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        parent_id uuid NULL,
        gl_expense_account_id uuid NOT NULL,
        budget_required boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_exp_category_name UNIQUE (name),
        CONSTRAINT fk_exp_category_parent_id FOREIGN KEY (parent_id)
          REFERENCES app.exp_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_category_gl_expense_account_id FOREIGN KEY (gl_expense_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_voucher (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        payee_type varchar(10) NOT NULL,
        payee_ref jsonb NOT NULL,
        category_id uuid NOT NULL,
        cost_center_id uuid NULL,
        amount numeric(18,4) NOT NULL,
        method varchar(10) NOT NULL,
        narrative text NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_exp_voucher_number UNIQUE (number),
        CONSTRAINT fk_exp_voucher_category_id FOREIGN KEY (category_id)
          REFERENCES app.exp_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_voucher_cost_center_id FOREIGN KEY (cost_center_id)
          REFERENCES app.gl_cost_center(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_voucher_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_voucher_payee_type CHECK (payee_type IN ('SUPPLIER','STAFF','OTHER')),
        CONSTRAINT ck_exp_voucher_method CHECK (method IN ('CASH','BANK','PETTY_CASH','MPESA','CHEQUE')),
        CONSTRAINT ck_exp_voucher_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')),
        CONSTRAINT ck_exp_voucher_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_petty_cash_float (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        custodian_user_id uuid NOT NULL,
        ceiling numeric(18,4) NOT NULL,
        balance numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_exp_petty_cash_float_custodian UNIQUE (custodian_user_id),
        CONSTRAINT fk_exp_petty_cash_float_custodian_user_id FOREIGN KEY (custodian_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_petty_cash_float_balance_range CHECK (balance >= 0 AND balance <= ceiling)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_petty_cash_voucher (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        float_id uuid NOT NULL,
        category_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        receipt_file_id uuid NULL,
        status varchar(20) NOT NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_exp_petty_cash_voucher_number UNIQUE (number),
        CONSTRAINT fk_exp_petty_cash_voucher_float_id FOREIGN KEY (float_id)
          REFERENCES app.exp_petty_cash_float(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_petty_cash_voucher_category_id FOREIGN KEY (category_id)
          REFERENCES app.exp_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_petty_cash_voucher_receipt_file_id FOREIGN KEY (receipt_file_id)
          REFERENCES app.file_object(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_petty_cash_voucher_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_petty_cash_voucher_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','CANCELLED')),
        CONSTRAINT ck_exp_petty_cash_voucher_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_replenishment (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        float_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        voucher_ids uuid[] NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT fk_exp_replenishment_float_id FOREIGN KEY (float_id)
          REFERENCES app.exp_petty_cash_float(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_replenishment_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_replenishment_status CHECK (status IN ('PENDING_APPROVAL','APPROVED','PAID')),
        CONSTRAINT ck_exp_replenishment_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_claim (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        staff_user_id uuid NOT NULL,
        total numeric(18,4) NOT NULL DEFAULT 0,
        status varchar(18) NOT NULL,
        reimburse_via varchar(10) NOT NULL,
        approval_ref uuid NULL,
        CONSTRAINT uq_exp_claim_number UNIQUE (number),
        CONSTRAINT fk_exp_claim_staff_user_id FOREIGN KEY (staff_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_claim_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REIMBURSED','REJECTED','CANCELLED')),
        CONSTRAINT ck_exp_claim_reimburse_via CHECK (reimburse_via IN ('PAYROLL','DIRECT')),
        CONSTRAINT ck_exp_claim_total_nonneg CHECK (total >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.exp_claim_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        claim_id uuid NOT NULL,
        line_no int NOT NULL,
        category_id uuid NOT NULL,
        description varchar(200) NOT NULL,
        amount numeric(18,4) NOT NULL,
        expense_date date NOT NULL,
        receipt_file_id uuid NULL,
        CONSTRAINT fk_exp_claim_line_claim_id FOREIGN KEY (claim_id)
          REFERENCES app.exp_claim(id) ON DELETE CASCADE,
        CONSTRAINT fk_exp_claim_line_category_id FOREIGN KEY (category_id)
          REFERENCES app.exp_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_exp_claim_line_receipt_file_id FOREIGN KEY (receipt_file_id)
          REFERENCES app.file_object(id) ON DELETE RESTRICT,
        CONSTRAINT ck_exp_claim_line_amount_positive CHECK (amount > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_exp_claim_line_claim ON app.exp_claim_line (claim_id)`);

    await queryRunner.query(`
      CREATE TABLE app.exp_recurring (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        template jsonb NOT NULL,
        schedule_cron varchar(30) NOT NULL,
        next_run_on date NOT NULL,
        last_voucher_id uuid NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT fk_exp_recurring_last_voucher_id FOREIGN KEY (last_voucher_id)
          REFERENCES app.exp_voucher(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_exp_recurring_next_run_on ON app.exp_recurring (next_run_on)`);

    // --- Trigger 1: trg_exp_voucher_immutable -------------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_exp_voucher_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('APPROVED','PAID') THEN
          IF NEW.amount <> OLD.amount
             OR NEW.category_id IS DISTINCT FROM OLD.category_id
             OR NEW.payee_type <> OLD.payee_type
             OR NEW.payee_ref <> OLD.payee_ref
             OR NEW.method <> OLD.method THEN
            RAISE EXCEPTION 'BR-EXP: expense voucher % financial columns are frozen once status=% — only narrative/cost_center_id/status/approval_ref/journal_id/version may still change',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_exp_voucher_immutable
        BEFORE UPDATE ON app.exp_voucher
        FOR EACH ROW EXECUTE FUNCTION app.fn_exp_voucher_immutable()
    `);

    // --- Trigger 2: trg_exp_petty_cash_voucher_immutable --------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_exp_petty_cash_voucher_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'APPROVED' THEN
          IF NEW.float_id IS DISTINCT FROM OLD.float_id
             OR NEW.category_id IS DISTINCT FROM OLD.category_id
             OR NEW.amount <> OLD.amount
             OR NEW.receipt_file_id IS DISTINCT FROM OLD.receipt_file_id THEN
            RAISE EXCEPTION 'BR-EXP: petty cash voucher % financial columns are frozen once status=% — only status/journal_id/version may still change',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_exp_petty_cash_voucher_immutable
        BEFORE UPDATE ON app.exp_petty_cash_voucher
        FOR EACH ROW EXECUTE FUNCTION app.fn_exp_petty_cash_voucher_immutable()
    `);

    // --- Trigger 3: trg_exp_claim_immutable ---------------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_exp_claim_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('APPROVED','REIMBURSED') THEN
          IF NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
             OR NEW.total <> OLD.total
             OR NEW.reimburse_via <> OLD.reimburse_via THEN
            RAISE EXCEPTION 'BR-EXP: staff claim % financial columns are frozen once status=% — only status/approval_ref/version may still change',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_exp_claim_immutable
        BEFORE UPDATE ON app.exp_claim
        FOR EACH ROW EXECUTE FUNCTION app.fn_exp_claim_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_exp_claim_immutable ON app.exp_claim`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_exp_claim_immutable()`);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_exp_petty_cash_voucher_immutable ON app.exp_petty_cash_voucher`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_exp_petty_cash_voucher_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_exp_voucher_immutable ON app.exp_voucher`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_exp_voucher_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_recurring`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_claim_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_claim`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_replenishment`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_petty_cash_voucher`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_petty_cash_float`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_voucher`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.exp_category`);
  }
}
