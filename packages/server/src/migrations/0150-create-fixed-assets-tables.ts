import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §5 (bottom half), the `fa_*` DDL —
 * Module 17 (Fixed Assets), **foundation pass only**: entities/
 * repositories/migration/triggers (docs/phase-5/PROGRESS.md).
 * Application-layer services (asset register, monthly depreciation-run
 * engine, disposal wizard, transfers, maintenance, physical verification
 * sessions, controllers, tests, seed) land in a later pass.
 *
 * **Table count**: 9 physical tables — the DDL's own "+ fa_depreciation_line"
 * / "+ line child" inline shorthands are realized as two real child tables,
 * the same treatment `inv_stock_take_line`/`proc_grn_line` established for
 * identical shorthand: `fa_category`, `fa_asset`, `fa_depreciation_run`,
 * `fa_depreciation_line`, `fa_maintenance`, `fa_transfer`, `fa_disposal`,
 * `fa_verification`, `fa_verification_line`.
 *
 * Table order follows the FK dependency chain: `fa_category` (FK
 * `gl_account` x3) -> `fa_asset` (FK `fa_category`, `usr_user`,
 * `proc_supplier`, `proc_purchase_order`, `proc_grn`) ->
 * `fa_depreciation_run` (FK `gl_period`, `gl_journal`) ->
 * `fa_depreciation_line` (FK `fa_depreciation_run`, `fa_asset`) ->
 * `fa_maintenance` (FK `fa_asset`, `exp_voucher`) -> `fa_transfer` (FK
 * `fa_asset`, `usr_user` x3) -> `fa_disposal` (FK `fa_asset`, `gl_journal`)
 * -> `fa_verification` (FK `gl_journal`) -> `fa_verification_line` (FK
 * `fa_verification`, `fa_asset`).
 *
 * Three triggers realize this pass's DB-layer invariants:
 *
 * 1. **BR-FA-02** ("a disposed/written-off asset cannot receive further
 *    transactions; its record and history remain permanently") — a SINGLE
 *    reusable function `fn_check_asset_not_disposed()` (reads `NEW.asset_id`
 *    generically, since `fa_maintenance`/`fa_transfer`/`fa_depreciation_line`
 *    all name that FK column identically) raises an exception whenever the
 *    referenced `fa_asset.status IN ('DISPOSED','WRITTEN_OFF')`. Attached via
 *    THREE separate `CREATE TRIGGER ... BEFORE INSERT` statements — one per
 *    table — all calling the same function, rather than duplicating the
 *    check logic three times. Collectively these three triggers realize
 *    what the task brief names `trg_fa_asset_no_txn_after_disposal`; each
 *    individual trigger is named per its own table
 *    (`trg_fa_maintenance_no_txn_after_disposal`/
 *    `trg_fa_transfer_no_txn_after_disposal`/
 *    `trg_fa_depreciation_line_no_txn_after_disposal`) so `DROP TRIGGER`
 *    statements stay unambiguous per-table in `down()`.
 * 2. **`trg_fa_depreciation_run_immutable`** — `BEFORE UPDATE` on
 *    `fa_depreciation_run`, rejects ALL updates once `status='POSTED'` —
 *    an unconditional freeze, deliberately simpler than `pyrl_run`'s own
 *    immutability trigger (which must keep allowing `status` to progress
 *    `COMMITTED -> PAID -> FILED` after its own freeze point). A posted
 *    depreciation run has NO further legitimate status progression at all:
 *    `POSTED` is this entity's own terminal state (the DDL's 3-value enum
 *    ends there, unlike `pyrl_run`'s longer tail), so this trigger doesn't
 *    need the "allow status to keep progressing" carve-out other `_run`-style
 *    immutability triggers required.
 * 3. **`trg_fa_disposal_immutable`** — same unconditional-freeze shape once
 *    `fa_disposal.status='POSTED'` (also this entity's own terminal state,
 *    see `FaDisposalEntity`'s doc comment for its `DRAFT|PENDING_APPROVAL|
 *    APPROVED|POSTED` enum design decision).
 *
 * **Deliberately NOT added**: a `trg_gl_writer_guard`-style
 * `application_name`-checking trigger on this module's tables — the same
 * judgement call every prior module this size has made (single-writer-
 * service discipline at the application layer is sufficient; only
 * `accounting`'s own `gl_journal`/`gl_journal_line`/
 * `gl_period_account_total` get that choke point, since they're the actual
 * ledger of record every other module posts *into* via `PostingService`,
 * not this module's own tables).
 */
export class CreateFixedAssetsTables0150 implements MigrationInterface {
  name = "CreateFixedAssetsTables1700000000150";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.fa_category (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        method varchar(2) NOT NULL,
        life_months int NOT NULL,
        rate numeric(9,6) NULL,
        residual_pct numeric(5,4) NOT NULL DEFAULT 0,
        gl_cost_account_id uuid NOT NULL,
        gl_accum_dep_account_id uuid NOT NULL,
        gl_dep_expense_account_id uuid NOT NULL,
        CONSTRAINT uq_fa_category_name UNIQUE (name),
        CONSTRAINT fk_fa_category_gl_cost_account_id FOREIGN KEY (gl_cost_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_category_gl_accum_dep_account_id FOREIGN KEY (gl_accum_dep_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_category_gl_dep_expense_account_id FOREIGN KEY (gl_dep_expense_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_category_method CHECK (method IN ('SL','RB'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_asset (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        code varchar(30) NOT NULL,
        name varchar(120) NOT NULL,
        category_id uuid NOT NULL,
        serial_no varchar(60) NULL,
        barcode varchar(60) NULL,
        location varchar(120) NOT NULL,
        custodian_user_id uuid NULL,
        acquisition_date date NOT NULL,
        cost numeric(18,4) NOT NULL,
        funding_source varchar(10) NOT NULL,
        supplier_id uuid NULL,
        po_id uuid NULL,
        grn_id uuid NULL,
        in_service_from date NOT NULL,
        life_months_override int NULL,
        residual_value numeric(18,4) NOT NULL,
        accum_depreciation numeric(18,4) NOT NULL DEFAULT 0,
        status varchar(20) NOT NULL,
        insurance jsonb NULL,
        condition varchar(20) NOT NULL,
        photos uuid[] NULL,
        CONSTRAINT uq_fa_asset_code UNIQUE (code),
        CONSTRAINT fk_fa_asset_category_id FOREIGN KEY (category_id)
          REFERENCES app.fa_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_asset_custodian_user_id FOREIGN KEY (custodian_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_asset_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_asset_po_id FOREIGN KEY (po_id)
          REFERENCES app.proc_purchase_order(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_asset_grn_id FOREIGN KEY (grn_id)
          REFERENCES app.proc_grn(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_asset_funding_source CHECK (funding_source IN ('SCHOOL','GRANT','DONOR')),
        CONSTRAINT ck_fa_asset_status CHECK (status IN
          ('ACTIVE','UNDER_MAINTENANCE','TRANSFERRED','DISPOSED','WRITTEN_OFF')),
        CONSTRAINT ck_fa_asset_accum_dep_within_depreciable_base CHECK (accum_depreciation <= cost - residual_value)
      )
    `);
    // DDL's own `barcode UQ NULL` — partial unique index, non-NULL barcodes only (same shape `inv_item.barcode` established).
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_fa_asset_barcode ON app.fa_asset (barcode) WHERE barcode IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_depreciation_run (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        period_id uuid NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_fa_depreciation_run_period_id UNIQUE (period_id),
        CONSTRAINT fk_fa_depreciation_run_period_id FOREIGN KEY (period_id)
          REFERENCES app.gl_period(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_depreciation_run_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_depreciation_run_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','POSTED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_depreciation_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        run_id uuid NOT NULL,
        asset_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        nbv_after numeric(18,4) NOT NULL,
        CONSTRAINT uq_fa_depreciation_line_run_asset UNIQUE (run_id, asset_id),
        CONSTRAINT fk_fa_depreciation_line_run_id FOREIGN KEY (run_id)
          REFERENCES app.fa_depreciation_run(id) ON DELETE CASCADE,
        CONSTRAINT fk_fa_depreciation_line_asset_id FOREIGN KEY (asset_id)
          REFERENCES app.fa_asset(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_maintenance (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        asset_id uuid NOT NULL,
        kind varchar(10) NOT NULL,
        scheduled_on date NULL,
        done_on date NULL,
        cost_expense_voucher_id uuid NULL,
        downtime_note text NOT NULL,
        CONSTRAINT fk_fa_maintenance_asset_id FOREIGN KEY (asset_id)
          REFERENCES app.fa_asset(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_maintenance_cost_expense_voucher_id FOREIGN KEY (cost_expense_voucher_id)
          REFERENCES app.exp_voucher(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_maintenance_kind CHECK (kind IN ('PLANNED','REPAIR'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_transfer (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        asset_id uuid NOT NULL,
        from_location varchar(120) NOT NULL,
        from_custodian_user_id uuid NULL,
        to_location varchar(120) NOT NULL,
        to_custodian_user_id uuid NULL,
        ack_by uuid NULL,
        at timestamptz NOT NULL,
        CONSTRAINT fk_fa_transfer_asset_id FOREIGN KEY (asset_id)
          REFERENCES app.fa_asset(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_transfer_from_custodian_user_id FOREIGN KEY (from_custodian_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_transfer_to_custodian_user_id FOREIGN KEY (to_custodian_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_transfer_ack_by FOREIGN KEY (ack_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_disposal (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        asset_id uuid NOT NULL,
        method varchar(10) NOT NULL,
        proceeds numeric(18,4) NOT NULL DEFAULT 0,
        gain_loss numeric(18,4) NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_fa_disposal_asset_id UNIQUE (asset_id),
        CONSTRAINT fk_fa_disposal_asset_id FOREIGN KEY (asset_id)
          REFERENCES app.fa_asset(id) ON DELETE RESTRICT,
        CONSTRAINT fk_fa_disposal_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_disposal_method CHECK (method IN ('SALE','SCRAP','DONATION','WRITE_OFF')),
        CONSTRAINT ck_fa_disposal_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_verification (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        scope jsonb NOT NULL,
        snapshot_at timestamptz NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_fa_verification_number UNIQUE (number),
        CONSTRAINT fk_fa_verification_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_fa_verification_status CHECK (status IN
          ('OPEN','COUNTING','REVIEW','PENDING_APPROVAL','POSTED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.fa_verification_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        verification_id uuid NOT NULL,
        asset_id uuid NOT NULL,
        found boolean NOT NULL DEFAULT false,
        condition varchar(20) NULL,
        notes text NULL,
        CONSTRAINT fk_fa_verification_line_verification_id FOREIGN KEY (verification_id)
          REFERENCES app.fa_verification(id) ON DELETE CASCADE,
        CONSTRAINT fk_fa_verification_line_asset_id FOREIGN KEY (asset_id)
          REFERENCES app.fa_asset(id) ON DELETE RESTRICT
      )
    `);

    // --- Trigger set 1: BR-FA-02, shared function + 3 BEFORE INSERT triggers ---
    await queryRunner.query(`
      CREATE FUNCTION app.fn_check_asset_not_disposed() RETURNS trigger AS $$
      DECLARE
        v_status varchar(20);
      BEGIN
        SELECT status INTO v_status FROM app.fa_asset WHERE id = NEW.asset_id;
        IF v_status IN ('DISPOSED','WRITTEN_OFF') THEN
          RAISE EXCEPTION 'BR-FA-02: asset % cannot receive further transactions — status=% (disposed/written-off assets retain their record and history permanently, but accept no new maintenance/transfer/depreciation rows)',
            NEW.asset_id, v_status
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_fa_maintenance_no_txn_after_disposal
        BEFORE INSERT ON app.fa_maintenance
        FOR EACH ROW EXECUTE FUNCTION app.fn_check_asset_not_disposed()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_fa_transfer_no_txn_after_disposal
        BEFORE INSERT ON app.fa_transfer
        FOR EACH ROW EXECUTE FUNCTION app.fn_check_asset_not_disposed()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_fa_depreciation_line_no_txn_after_disposal
        BEFORE INSERT ON app.fa_depreciation_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_check_asset_not_disposed()
    `);

    // --- Trigger 2: trg_fa_depreciation_run_immutable (unconditional freeze once POSTED) ---
    await queryRunner.query(`
      CREATE FUNCTION app.fn_fa_depreciation_run_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'POSTED' THEN
          RAISE EXCEPTION 'BR-GEN-03: depreciation run % is immutable once POSTED — no further updates of any kind are permitted (a posted depreciation run has no further legitimate status progression; corrections require a new run in a later period, never an edit to a posted one)',
            OLD.id
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_fa_depreciation_run_immutable
        BEFORE UPDATE ON app.fa_depreciation_run
        FOR EACH ROW EXECUTE FUNCTION app.fn_fa_depreciation_run_immutable()
    `);

    // --- Trigger 3: trg_fa_disposal_immutable (unconditional freeze once POSTED) ---
    await queryRunner.query(`
      CREATE FUNCTION app.fn_fa_disposal_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'POSTED' THEN
          RAISE EXCEPTION 'BR-GEN-03: disposal % is immutable once POSTED — no further updates of any kind are permitted',
            OLD.id
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_fa_disposal_immutable
        BEFORE UPDATE ON app.fa_disposal
        FOR EACH ROW EXECUTE FUNCTION app.fn_fa_disposal_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_fa_disposal_immutable ON app.fa_disposal`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_fa_disposal_immutable()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_fa_depreciation_run_immutable ON app.fa_depreciation_run`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_fa_depreciation_run_immutable()`);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_fa_depreciation_line_no_txn_after_disposal ON app.fa_depreciation_line`,
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_fa_transfer_no_txn_after_disposal ON app.fa_transfer`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_fa_maintenance_no_txn_after_disposal ON app.fa_maintenance`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_check_asset_not_disposed()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_verification_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_verification`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_disposal`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_transfer`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_maintenance`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_depreciation_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_depreciation_run`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_asset`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.fa_category`);
  }
}
