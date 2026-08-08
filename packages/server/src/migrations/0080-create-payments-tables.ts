import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/03-schema-student-finance.md §4, the `pay_*` DDL — Module 10
 * (Payments), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services (cashier
 * session management, receipt capture+posting, M-Pesa STK/C2B/B2C handling,
 * suspense matching, bulk allocation, cheque clearing, controllers, tests,
 * seed) land in a later pass.
 *
 * **Table count**: the DDL's 9 conceptual entries expand to 9 physical
 * tables — `pay_bulk_allocation_batch` is explicitly noted in the DDL as
 * needing its own `_line` child (`pay_bulk_allocation_batch_line`), so the
 * 9-entry list (`pay_cashier_session`, `pay_receipt`, `pay_receipt_split`,
 * `pay_receipt_allocation`, `pay_cheque`, `pay_mpesa_transaction`,
 * `pay_suspense_item`, `pay_bulk_allocation_batch`,
 * `pay_bulk_allocation_batch_line`) is realized as-is, no additional split
 * (unlike Module 9's credit/debit-note expansion).
 *
 * Table order follows the FK dependency chain: `pay_cashier_session` (FK
 * `usr_user`) -> `pay_cheque` (no deps) -> `pay_receipt` (FK
 * `std_student`/`usr_user`/`pay_cashier_session`/`gl_journal`, self-ref
 * `reversal_of_id`) -> `pay_mpesa_transaction` (FK `pay_receipt`) ->
 * `pay_receipt_split` (FK `pay_receipt`/`pay_cheque`/`pay_mpesa_transaction`)
 * -> `pay_receipt_allocation` (FK `pay_receipt`/`bill_invoice`/
 * `bill_installment`) -> `pay_suspense_item` (FK `pay_receipt`/`usr_user`)
 * -> `pay_bulk_allocation_batch` (no deps) ->
 * `pay_bulk_allocation_batch_line` (FK `pay_bulk_allocation_batch`/
 * `std_student`/`pay_receipt`).
 *
 * **`pay_bulk_allocation_batch.status`** carries a CHECK the source DDL
 * doesn't specify an enum for — `DRAFT|MATCHING|COMPLETED|FAILED`, a
 * documented judgement call (see `PayBulkAllocationBatchEntity`'s doc
 * comment for the reasoning).
 *
 * Three triggers realize this pass's DB-layer invariants:
 * 1. `trg_pay_receipt_immutable` — `BEFORE UPDATE` on `pay_receipt`, rejects
 *    any change to `total`/`student_id`/`journal_id`/`balance_after`
 *    unconditionally, and rejects any change to `status` unless it is
 *    exactly the one legitimate `POSTED -> REVERSED` transition (rejecting
 *    outright once `OLD.status = 'REVERSED'`, since a reversed receipt's
 *    status is then permanently frozen). Every other column (in particular
 *    `reprint_count`, which the next pass's reprint flow increments in
 *    place, and `reversal_reason`/`reversal_of_id`, written at the moment of
 *    the one legitimate status transition per FR-PAY-012.1's "original and
 *    reversal cross-reference each other") remains ordinarily writable —
 *    the same column-by-column `OLD`/`NEW` comparison style
 *    `trg_bill_invoice_immutable` (migration `0070`) established, scoped to
 *    exactly the columns the task brief names, not a blanket allow-list.
 * 2. `trg_pay_splits_sum` (BR-PAY-01) — a `DEFERRABLE INITIALLY DEFERRED`
 *    constraint trigger on `pay_receipt_split` (`AFTER INSERT OR UPDATE OR
 *    DELETE`), asserting `SUM(amount)` for the affected `receipt_id` equals
 *    that receipt's `total` at COMMIT — the exact deferred-aggregate
 *    pattern `trg_gl_journal_balanced`/`trg_bill_installments_sum`
 *    established.
 * 3. `trg_pay_allocations_sum` (BR-PAY-03 — "a receipt can never leave
 *    unallocated floating money") — the identical deferred-constraint-
 *    trigger shape on `pay_receipt_allocation`, asserting `SUM(amount)` for
 *    the affected `receipt_id` equals that receipt's `total`.
 */
export class CreatePaymentsTables0080 implements MigrationInterface {
  name = "CreatePaymentsTables1700000000080";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.pay_cashier_session (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        cashier_id uuid NOT NULL,
        till varchar(30) NOT NULL,
        status varchar(10) NOT NULL,
        opened_at timestamptz NOT NULL,
        float_amount numeric(18,4) NOT NULL,
        closed_at timestamptz NULL,
        counted jsonb NULL,
        expected_totals jsonb NULL,
        variance_amount numeric(18,4) NULL,
        variance_reason text NULL,
        supervisor_id uuid NULL,
        CONSTRAINT fk_pay_cashier_session_cashier_id FOREIGN KEY (cashier_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_cashier_session_supervisor_id FOREIGN KEY (supervisor_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_cashier_session_status CHECK (status IN ('OPEN','CLOSED'))
      )
    `);
    // BR-PAY-04: at most one OPEN session per cashier at a time.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_pay_session_open_p ON app.pay_cashier_session (cashier_id)
        WHERE status = 'OPEN'
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_cheque (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        bank_name varchar(80) NOT NULL,
        cheque_no varchar(30) NOT NULL,
        cheque_date date NOT NULL,
        drawer varchar(120) NOT NULL,
        amount numeric(18,4) NOT NULL,
        status varchar(10) NOT NULL,
        status_changed_at timestamptz NULL,
        bounce_fee_applied boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_pay_cheque_bank_no_drawer UNIQUE (bank_name, cheque_no, drawer),
        CONSTRAINT ck_pay_cheque_status CHECK (status IN ('UNCLEARED','CLEARED','BOUNCED')),
        CONSTRAINT ck_pay_cheque_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_receipt (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        student_id uuid NOT NULL,
        payer_name varchar(120) NOT NULL,
        payer_phone varchar(20) NULL,
        receipt_date date NOT NULL,
        total numeric(18,4) NOT NULL,
        status varchar(10) NOT NULL,
        reversal_of_id uuid NULL,
        reversal_reason varchar(20) NULL,
        approval_ref uuid NULL,
        cashier_id uuid NOT NULL,
        session_id uuid NULL,
        journal_id uuid NOT NULL,
        idempotency_key varchar(64) NULL,
        balance_after numeric(18,4) NOT NULL,
        reprint_count int NOT NULL DEFAULT 0,
        CONSTRAINT uq_pay_receipt_number UNIQUE (number),
        CONSTRAINT fk_pay_receipt_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_reversal_of_id FOREIGN KEY (reversal_of_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_cashier_id FOREIGN KEY (cashier_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_session_id FOREIGN KEY (session_id)
          REFERENCES app.pay_cashier_session(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_receipt_status CHECK (status IN ('POSTED','REVERSED')),
        CONSTRAINT ck_pay_receipt_total_positive CHECK (total > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_pay_receipt_student ON app.pay_receipt (student_id, receipt_date DESC)`);
    await queryRunner.query(`CREATE INDEX ix_pay_receipt_session ON app.pay_receipt (session_id)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_pay_receipt_idempotency_key ON app.pay_receipt (idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);
    // Multi-year append-mostly table axis — BRIN per docs/phase-4/01-standards-and-migrations.md §6.
    await queryRunner.query(`CREATE INDEX ix_pay_receipt_created_at_brin ON app.pay_receipt USING BRIN (created_at)`);

    await queryRunner.query(`
      CREATE TABLE app.pay_mpesa_transaction (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        kind varchar(6) NOT NULL,
        shortcode varchar(12) NOT NULL,
        msisdn_masked varchar(20) NOT NULL,
        amount numeric(18,4) NOT NULL,
        mpesa_ref varchar(20) NULL,
        checkout_request_id varchar(60) NULL,
        conversation_id varchar(60) NULL,
        bill_ref varchar(60) NULL,
        state varchar(15) NOT NULL,
        raw_request jsonb NOT NULL,
        raw_callback jsonb NULL,
        matched_receipt_id uuid NULL,
        wallet_transaction_id uuid NULL,
        CONSTRAINT uq_pay_mpesa_ref UNIQUE (mpesa_ref),
        CONSTRAINT uq_pay_mpesa_checkout_request_id UNIQUE (checkout_request_id),
        CONSTRAINT uq_pay_mpesa_conversation_id UNIQUE (conversation_id),
        CONSTRAINT fk_pay_mpesa_transaction_matched_receipt_id FOREIGN KEY (matched_receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_mpesa_transaction_kind CHECK (kind IN ('STK','C2B','B2C')),
        CONSTRAINT ck_pay_mpesa_transaction_state CHECK (state IN ('INITIATED','PENDING','CONFIRMED','FAILED','TIMEOUT','REVERSED'))
      )
    `);
    // FR-PAY-008.1: STK pending-fallback sweep.
    await queryRunner.query(`
      CREATE INDEX ix_pay_mpesa_state_p ON app.pay_mpesa_transaction (created_at)
        WHERE state IN ('INITIATED','PENDING')
    `);
    await queryRunner.query(`CREATE INDEX ix_pay_mpesa_bill_ref ON app.pay_mpesa_transaction (bill_ref)`);

    await queryRunner.query(`
      CREATE TABLE app.pay_receipt_split (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        receipt_id uuid NOT NULL,
        method varchar(15) NOT NULL,
        amount numeric(18,4) NOT NULL,
        bank_account_id uuid NULL,
        cheque_id uuid NULL,
        mpesa_transaction_id uuid NULL,
        external_ref varchar(60) NULL,
        CONSTRAINT fk_pay_receipt_split_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE CASCADE,
        CONSTRAINT fk_pay_receipt_split_cheque_id FOREIGN KEY (cheque_id)
          REFERENCES app.pay_cheque(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_split_mpesa_transaction_id FOREIGN KEY (mpesa_transaction_id)
          REFERENCES app.pay_mpesa_transaction(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_receipt_split_method CHECK (method IN ('CASH','BANK','CHEQUE','CARD','POS','MPESA_STK','MPESA_C2B','MPESA_TILL','WALLET','BANK_TRANSFER')),
        CONSTRAINT ck_pay_receipt_split_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_receipt_allocation (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        receipt_id uuid NOT NULL,
        invoice_id uuid NULL,
        installment_id uuid NULL,
        to_prepayment boolean NOT NULL DEFAULT false,
        amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_pay_receipt_allocation_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE CASCADE,
        CONSTRAINT fk_pay_receipt_allocation_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_receipt_allocation_installment_id FOREIGN KEY (installment_id)
          REFERENCES app.bill_installment(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_receipt_allocation_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_suspense_item (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        source varchar(10) NOT NULL,
        amount numeric(18,4) NOT NULL,
        external_ref varchar(60) NOT NULL,
        raw jsonb NOT NULL,
        received_at timestamptz NOT NULL,
        state varchar(10) NOT NULL,
        resolved_receipt_id uuid NULL,
        resolved_by uuid NULL,
        resolved_at timestamptz NULL,
        resolution_note text NULL,
        CONSTRAINT fk_pay_suspense_item_resolved_receipt_id FOREIGN KEY (resolved_receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_suspense_item_resolved_by FOREIGN KEY (resolved_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_suspense_item_source CHECK (source IN ('C2B','BANK','OTHER')),
        CONSTRAINT ck_pay_suspense_item_state CHECK (state IN ('OPEN','MATCHED','REFUNDED')),
        CONSTRAINT ck_pay_suspense_item_amount_positive CHECK (amount > 0)
      )
    `);
    // BR-PAY-07: suspense digest.
    await queryRunner.query(`
      CREATE INDEX ix_pay_suspense_open_p ON app.pay_suspense_item (received_at)
        WHERE state = 'OPEN'
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_bulk_allocation_batch (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        instrument jsonb NOT NULL,
        total numeric(18,4) NOT NULL,
        status varchar(15) NOT NULL,
        created_receipts int NOT NULL DEFAULT 0,
        CONSTRAINT ck_pay_bulk_allocation_batch_status CHECK (status IN ('DRAFT','MATCHING','COMPLETED','FAILED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.pay_bulk_allocation_batch_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        batch_id uuid NOT NULL,
        student_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        receipt_id uuid NULL,
        CONSTRAINT fk_pay_bulk_allocation_batch_line_batch_id FOREIGN KEY (batch_id)
          REFERENCES app.pay_bulk_allocation_batch(id) ON DELETE CASCADE,
        CONSTRAINT fk_pay_bulk_allocation_batch_line_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_bulk_allocation_batch_line_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT ck_pay_bulk_allocation_batch_line_amount_positive CHECK (amount > 0)
      )
    `);

    // --- Trigger 1: trg_pay_receipt_immutable ------------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_pay_receipt_immutable() RETURNS trigger AS $$
      BEGIN
        IF NEW.total <> OLD.total
           OR NEW.student_id <> OLD.student_id
           OR NEW.journal_id <> OLD.journal_id
           OR NEW.balance_after <> OLD.balance_after THEN
          RAISE EXCEPTION 'BR-PAY: receipt % financial columns (total/student_id/journal_id/balance_after) are frozen — a reversal is a new contra receipt, never an edit',
            OLD.id
            USING ERRCODE = '23514';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
          IF OLD.status = 'REVERSED' THEN
            RAISE EXCEPTION 'BR-PAY-08: receipt % is already REVERSED — status is now frozen', OLD.id
              USING ERRCODE = '23514';
          END IF;
          IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED') THEN
            RAISE EXCEPTION 'BR-PAY-08: receipt % status may only transition POSTED -> REVERSED', OLD.id
              USING ERRCODE = '23514';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_pay_receipt_immutable
        BEFORE UPDATE ON app.pay_receipt
        FOR EACH ROW EXECUTE FUNCTION app.fn_pay_receipt_immutable()
    `);

    // --- Trigger 2: trg_pay_splits_sum (BR-PAY-01) -------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_pay_splits_sum() RETURNS trigger AS $$
      DECLARE
        v_receipt_id uuid;
        v_split_sum numeric(18,4);
        v_receipt_total numeric(18,4);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_receipt_id := OLD.receipt_id;
        ELSE
          v_receipt_id := NEW.receipt_id;
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_split_sum
          FROM app.pay_receipt_split
          WHERE receipt_id = v_receipt_id;

        SELECT total INTO v_receipt_total FROM app.pay_receipt WHERE id = v_receipt_id;

        IF v_receipt_total IS NOT NULL AND v_split_sum <> v_receipt_total THEN
          RAISE EXCEPTION 'BR-PAY-01: receipt % splits sum to % but receipt total is %',
            v_receipt_id, v_split_sum, v_receipt_total
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_pay_splits_sum
        AFTER INSERT OR UPDATE OR DELETE ON app.pay_receipt_split
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION app.fn_pay_splits_sum()
    `);

    // --- Trigger 3: trg_pay_allocations_sum (BR-PAY-03) --------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_pay_allocations_sum() RETURNS trigger AS $$
      DECLARE
        v_receipt_id uuid;
        v_allocation_sum numeric(18,4);
        v_receipt_total numeric(18,4);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_receipt_id := OLD.receipt_id;
        ELSE
          v_receipt_id := NEW.receipt_id;
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_allocation_sum
          FROM app.pay_receipt_allocation
          WHERE receipt_id = v_receipt_id;

        SELECT total INTO v_receipt_total FROM app.pay_receipt WHERE id = v_receipt_id;

        IF v_receipt_total IS NOT NULL AND v_allocation_sum <> v_receipt_total THEN
          RAISE EXCEPTION 'BR-PAY-03: receipt % allocations sum to % but receipt total is %',
            v_receipt_id, v_allocation_sum, v_receipt_total
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_pay_allocations_sum
        AFTER INSERT OR UPDATE OR DELETE ON app.pay_receipt_allocation
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION app.fn_pay_allocations_sum()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_pay_allocations_sum ON app.pay_receipt_allocation`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_pay_allocations_sum()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_pay_splits_sum ON app.pay_receipt_split`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_pay_splits_sum()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_pay_receipt_immutable ON app.pay_receipt`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_pay_receipt_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_bulk_allocation_batch_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_bulk_allocation_batch`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_suspense_item`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_receipt_allocation`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_receipt_split`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_mpesa_transaction`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_receipt`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_cheque`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_cashier_session`);
  }
}
