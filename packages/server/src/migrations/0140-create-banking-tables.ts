import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §5, the `bank_*` DDL — Module 16
 * (Banking), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services (account
 * management, deposits/withdrawals/transfers, statement import with dedupe,
 * reconciliation workspace with auto-matching, cheque register issuance,
 * controllers, tests, seed) land in a later pass.
 *
 * **Table count**: the DDL's own "`bank_deposit` / `bank_withdrawal`"
 * shorthand (two separate tables sharing one shape) is realized as two real
 * physical tables — the same treatment `bill_credit_note`/`bill_debit_note`
 * (Module 9) established for an identical shorthand. 10 physical tables
 * total: `bank_account`, `bank_transfer`, `bank_deposit`, `bank_withdrawal`,
 * `bank_statement_import`, `bank_statement_line`, `bank_reconciliation`,
 * `bank_recon_match`, `bank_cheque_book`, `bank_cheque_leaf`.
 *
 * Table order follows the FK dependency chain: `bank_account` (FK
 * `gl_account`) -> `bank_transfer` (FK `bank_account` x2, `gl_journal`) ->
 * `bank_deposit`/`bank_withdrawal` (FK `bank_account`, `pay_cashier_session`,
 * `gl_journal`) -> `bank_statement_import` (FK `bank_account`,
 * `file_object`) -> `bank_statement_line` (FK `bank_statement_import`,
 * `bank_account`) -> `bank_reconciliation` (FK `bank_account`, `gl_period`)
 * -> `bank_recon_match` (FK `bank_reconciliation`, `bank_statement_line`,
 * `gl_journal_line`, `gl_journal`) -> `bank_cheque_book` (FK `bank_account`)
 * -> `bank_cheque_leaf` (FK `bank_cheque_book`, `proc_payment_voucher`).
 *
 * Two triggers realize this pass's DB-layer invariants:
 * 1. `trg_bank_statement_line_immutable` (BR-BANK-02) — `BEFORE UPDATE` on
 *    `bank_statement_line`, once `OLD.recon_state <> 'UNMATCHED'`, freezes
 *    `debit`/`credit`/`line_date`/`description`/`external_ref`/
 *    `dedupe_hash` ("reconciled entries lock against modification") but
 *    leaves `recon_state` itself writable — an authorized unreconcile/reopen
 *    flow the next pass may need.
 * 2. `trg_bank_reconciliation_immutable` — `BEFORE UPDATE` on
 *    `bank_reconciliation`, once `OLD.status='LOCKED'`, freezes
 *    `book_balance`/`bank_balance`/`outstanding` UNLESS the row is
 *    simultaneously transitioning to `REOPENED` — that specific transition
 *    passes through untouched, since `banking:reconciliation:reopen` is an
 *    explicit, documented, permission-gated escape hatch (FR-BANK-004.1).
 *
 * **Deliberately NOT added**: a `trg_gl_writer_guard`-style
 * `application_name`-checking trigger on this module's tables — the same
 * judgement call every prior module this size has made (single-writer-
 * service discipline at the application layer is sufficient; only
 * `accounting`'s own `gl_journal`/`gl_journal_line`/
 * `gl_period_account_total` get that choke point, since they're the actual
 * ledger of record every other module posts *into* via `PostingService`).
 *
 * **BR-BANK-03 cross-module flag** (NOT wired in this pass): see
 * `BankReconciliationEntity`'s own doc comment and
 * `docs/phase-5/PROGRESS.md`'s Module 16 row — a period's bank
 * reconciliation must be `LOCKED` before that period can be `HARD_CLOSED`;
 * `accounting`'s `FiscalYearsService.hardClosePeriod()` does not yet check
 * this, and this pass does not edit `accounting` to add it.
 */
export class CreateBankingTables0140 implements MigrationInterface {
  name = "CreateBankingTables1700000000140";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bank_account (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(80) NOT NULL,
        kind varchar(20) NOT NULL,
        bank_name varchar(120) NULL,
        branch varchar(120) NULL,
        account_no varchar(40) NULL,
        gl_account_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_bank_account_name UNIQUE (name),
        CONSTRAINT uq_bank_account_gl_account_id UNIQUE (gl_account_id),
        CONSTRAINT fk_bank_account_gl_account_id FOREIGN KEY (gl_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_account_kind CHECK (kind IN ('BANK','CASH','MPESA_SETTLEMENT','PETTY'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_transfer (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        from_account_id uuid NOT NULL,
        to_account_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_bank_transfer_number UNIQUE (number),
        CONSTRAINT fk_bank_transfer_from_account_id FOREIGN KEY (from_account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_transfer_to_account_id FOREIGN KEY (to_account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_transfer_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_transfer_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bank_transfer_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')),
        CONSTRAINT ck_bank_transfer_accounts_distinct CHECK (from_account_id <> to_account_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_deposit (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        account_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        slip_ref varchar(60) NULL,
        source_session_id uuid NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        ack_by_sender uuid NULL,
        ack_by_sender_at timestamptz NULL,
        ack_by_receiver uuid NULL,
        ack_by_receiver_at timestamptz NULL,
        CONSTRAINT uq_bank_deposit_number UNIQUE (number),
        CONSTRAINT fk_bank_deposit_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_deposit_source_session_id FOREIGN KEY (source_session_id)
          REFERENCES app.pay_cashier_session(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_deposit_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_deposit_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bank_deposit_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_withdrawal (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        account_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        slip_ref varchar(60) NULL,
        source_session_id uuid NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        ack_by_sender uuid NULL,
        ack_by_sender_at timestamptz NULL,
        ack_by_receiver uuid NULL,
        ack_by_receiver_at timestamptz NULL,
        CONSTRAINT uq_bank_withdrawal_number UNIQUE (number),
        CONSTRAINT fk_bank_withdrawal_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_withdrawal_source_session_id FOREIGN KEY (source_session_id)
          REFERENCES app.pay_cashier_session(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_withdrawal_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_withdrawal_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bank_withdrawal_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_statement_import (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        account_id uuid NOT NULL,
        file_id uuid NOT NULL,
        mapping_template jsonb NOT NULL,
        imported_at timestamptz NOT NULL,
        line_count int NOT NULL,
        duplicate_count int NOT NULL,
        CONSTRAINT fk_bank_statement_import_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_statement_import_file_id FOREIGN KEY (file_id)
          REFERENCES app.file_object(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_statement_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        import_id uuid NOT NULL,
        account_id uuid NOT NULL,
        line_date date NOT NULL,
        description text NOT NULL,
        debit numeric(18,4) NOT NULL DEFAULT 0,
        credit numeric(18,4) NOT NULL DEFAULT 0,
        external_ref varchar(80) NULL,
        dedupe_hash varchar(64) NOT NULL,
        recon_state varchar(10) NOT NULL,
        CONSTRAINT uq_bank_stmt_line_dedupe UNIQUE (account_id, dedupe_hash),
        CONSTRAINT fk_bank_stmt_line_import_id FOREIGN KEY (import_id)
          REFERENCES app.bank_statement_import(id) ON DELETE CASCADE,
        CONSTRAINT fk_bank_stmt_line_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_stmt_line_recon_state CHECK (recon_state IN ('UNMATCHED','MATCHED','ADJUSTED')),
        CONSTRAINT ck_bank_stmt_line_amounts_nonneg CHECK (debit >= 0 AND credit >= 0)
      )
    `);
    // DDL's own `ix_bank_stmt_unmatched_p (account_id, line_date) WHERE recon_state='UNMATCHED'` — FR-BANK-004.1's reconciliation-workspace lookup.
    await queryRunner.query(`
      CREATE INDEX ix_bank_stmt_unmatched_p ON app.bank_statement_line (account_id, line_date)
        WHERE recon_state = 'UNMATCHED'
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_reconciliation (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        account_id uuid NOT NULL,
        period_id uuid NOT NULL,
        status varchar(12) NOT NULL,
        book_balance numeric(18,4) NOT NULL,
        bank_balance numeric(18,4) NOT NULL,
        outstanding jsonb NOT NULL,
        locked_by uuid NULL,
        locked_at timestamptz NULL,
        CONSTRAINT uq_bank_reconciliation_account_period UNIQUE (account_id, period_id),
        CONSTRAINT fk_bank_reconciliation_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_reconciliation_period_id FOREIGN KEY (period_id)
          REFERENCES app.gl_period(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_reconciliation_status CHECK (status IN ('IN_PROGRESS','LOCKED','REOPENED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_recon_match (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        reconciliation_id uuid NOT NULL,
        statement_line_id uuid NOT NULL,
        journal_line_id uuid NULL,
        adjustment_journal_id uuid NULL,
        CONSTRAINT uq_bank_recon_match_statement_line UNIQUE (statement_line_id),
        CONSTRAINT uq_bank_recon_match_journal_line UNIQUE (journal_line_id),
        CONSTRAINT fk_bank_recon_match_reconciliation_id FOREIGN KEY (reconciliation_id)
          REFERENCES app.bank_reconciliation(id) ON DELETE CASCADE,
        CONSTRAINT fk_bank_recon_match_statement_line_id FOREIGN KEY (statement_line_id)
          REFERENCES app.bank_statement_line(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_recon_match_journal_line_id FOREIGN KEY (journal_line_id)
          REFERENCES app.gl_journal_line(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_recon_match_adjustment_journal_id FOREIGN KEY (adjustment_journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_cheque_book (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        account_id uuid NOT NULL,
        prefix varchar(10) NOT NULL,
        start_leaf int NOT NULL,
        end_leaf int NOT NULL,
        CONSTRAINT fk_bank_cheque_book_account_id FOREIGN KEY (account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_cheque_book_leaf_range CHECK (end_leaf >= start_leaf)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.bank_cheque_leaf (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        book_id uuid NOT NULL,
        leaf_no int NOT NULL,
        status varchar(10) NOT NULL,
        voucher_id uuid NULL,
        payee varchar(120) NULL,
        amount numeric(18,4) NULL,
        issued_on date NULL,
        status_reason text NULL,
        CONSTRAINT uq_bank_cheque_leaf_book_leaf UNIQUE (book_id, leaf_no),
        CONSTRAINT fk_bank_cheque_leaf_book_id FOREIGN KEY (book_id)
          REFERENCES app.bank_cheque_book(id) ON DELETE CASCADE,
        CONSTRAINT fk_bank_cheque_leaf_voucher_id FOREIGN KEY (voucher_id)
          REFERENCES app.proc_payment_voucher(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_cheque_leaf_status CHECK (status IN
          ('UNUSED','ISSUED','PRESENTED','CLEARED','STOPPED','CANCELLED','STALE'))
      )
    `);

    // --- Trigger 1: trg_bank_statement_line_immutable (BR-BANK-02) --------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bank_statement_line_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.recon_state <> 'UNMATCHED' THEN
          IF NEW.debit <> OLD.debit
             OR NEW.credit <> OLD.credit
             OR NEW.line_date <> OLD.line_date
             OR NEW.description <> OLD.description
             OR NEW.external_ref IS DISTINCT FROM OLD.external_ref
             OR NEW.dedupe_hash <> OLD.dedupe_hash THEN
            RAISE EXCEPTION 'BR-BANK-02: statement line % is immutable once recon_state=% (reconciled) — debit/credit/line_date/description/external_ref/dedupe_hash cannot change; recon_state itself may still progress (e.g. an authorized unreconcile/reopen flow)',
              OLD.id, OLD.recon_state
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bank_statement_line_immutable
        BEFORE UPDATE ON app.bank_statement_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_bank_statement_line_immutable()
    `);

    // --- Trigger 2: trg_bank_reconciliation_immutable ----------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bank_reconciliation_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'LOCKED' AND NEW.status <> 'REOPENED' THEN
          IF NEW.book_balance <> OLD.book_balance
             OR NEW.bank_balance <> OLD.bank_balance
             OR NEW.outstanding IS DISTINCT FROM OLD.outstanding THEN
            RAISE EXCEPTION 'FR-BANK-004.1: reconciliation % is immutable once status=LOCKED — book_balance/bank_balance/outstanding cannot change unless the row is simultaneously transitioning to REOPENED (the banking:reconciliation:reopen escape hatch)',
              OLD.id
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bank_reconciliation_immutable
        BEFORE UPDATE ON app.bank_reconciliation
        FOR EACH ROW EXECUTE FUNCTION app.fn_bank_reconciliation_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bank_reconciliation_immutable ON app.bank_reconciliation`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bank_reconciliation_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bank_statement_line_immutable ON app.bank_statement_line`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bank_statement_line_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_cheque_leaf`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_cheque_book`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_recon_match`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_reconciliation`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_statement_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_statement_import`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_withdrawal`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_deposit`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_transfer`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_account`);
  }
}
