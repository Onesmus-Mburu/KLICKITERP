import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §3, the `inv_*` DDL — Module 13
 * (Inventory), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services (item
 * master, weighted-average stock-movement engine, transfers, stock-takes
 * with approval-gated adjustments, GRN/POS integration hooks, controllers,
 * tests, seed) land in a later pass.
 *
 * **Table count**: 9 physical tables — `inv_category`, `inv_store`,
 * `inv_item`, `inv_stock_balance`, `inv_movement`, `inv_transfer`,
 * `inv_transfer_line` (the DDL's inline "+ lines" child), `inv_stock_take`,
 * `inv_stock_take_line` (the DDL's inline "+ inv_stock_take_line" child).
 *
 * Table order follows the FK dependency chain: `inv_category` (self-ref
 * `parent_id`) -> `inv_store` (FK `usr_user`) -> `inv_item` (FK
 * `inv_category`, `gl_account` x3) -> `inv_stock_balance` (FK `inv_item`,
 * `inv_store`) -> `inv_movement` (FK `inv_item`, `inv_store`, `gl_journal`)
 * -> `inv_transfer` (FK `inv_store` x2, `usr_user` x2) -> `inv_transfer_line`
 * (FK `inv_transfer`, `inv_item`) -> `inv_stock_take` (FK `inv_store`,
 * `gl_journal`) -> `inv_stock_take_line` (FK `inv_stock_take`, `inv_item`).
 *
 * **`variance_qty` on `inv_stock_take_line`** is a real Postgres `GENERATED
 * ALWAYS AS (counted_qty - snapshot_qty) STORED` column, spelled out here in
 * raw SQL — TypeORM's `generatedType: 'STORED'`/`asExpression` entity
 * metadata (`InvStockTakeLineEntity.varianceQty`) is read-only
 * hydration/query-builder metadata, NOT a DDL source in this codebase's
 * hand-written-migration workflow (no `synchronize` step exists anywhere in
 * the build/deploy path) — same technique migration `0065`
 * (`StdStudentEntity.searchName`) established, kept character-for-character
 * identical between the two files.
 *
 * **`ix_inv_item_name_trgm`** (GIN `gin_trgm_ops` on `inv_item.name`, the
 * DDL's own `ix: GIN trgm(name)`) and **`ix_inv_movement_at_brin`** (BRIN on
 * the append-only `inv_movement.at` time axis, per
 * docs/phase-4/01-standards-and-migrations.md §6) are both raw SQL — no
 * TypeORM decorator support for either operator class/access method, same
 * as every other trgm/BRIN index in this codebase.
 *
 * **BR-INV-01** (`ck_inv_stock_balance_qty_nonneg`, `qty >= 0`) and
 * **BR-INV-04** (`ck_inv_item_resale_requires_price_and_income`) are both
 * realized as plain CHECK constraints — see `InvStockBalanceEntity`/
 * `InvItemEntity`'s own doc comments.
 *
 * **`trg_inv_movement_immutable`** — `BEFORE UPDATE OR DELETE` on
 * `inv_movement`, unconditional reject, no exceptions. `inv_movement` is an
 * append-only audit ledger the same conceptual shape `gl_journal_line`/
 * `wall_transaction` are, but unlike those two (whose immutability is a
 * documented *convention*, enforced only by "no code path calls `.save()`
 * on an existing row," not always backed by an explicit DB trigger),
 * `inv_movement` genuinely warrants one: inventory valuation integrity
 * (the weighted-average cost cache on `inv_item.avg_cost` and every
 * `inv_stock_balance` row) is derived by replaying this ledger, so a single
 * stray UPDATE/DELETE anywhere in a future pass could silently corrupt
 * valuation with no way to detect it after the fact. The DB trigger closes
 * that gap unconditionally, independent of application-layer discipline.
 *
 * **Writer-guard-trigger judgement call (`inv_stock_balance`/
 * `inv_movement`)**: deliberately NOT given a `trg_gl_writer_guard`-style
 * `BEFORE INSERT OR UPDATE` `application_name` gate, the same judgement call
 * Wallet's migration `0090` made for `wall_wallet` (see that migration's own
 * doc comment for the full reasoning) — `trg_gl_journal`'s writer-guard
 * exists because MANY current and future modules post into the *shared* GL
 * tables, a genuine multi-module fan-in problem; `inv_stock_balance`/
 * `inv_movement` will only ever be written by exactly one future service in
 * this codebase (the next pass's stock-movement engine), and TypeScript's
 * module boundary (only `inventory.module.ts` registers a repository
 * provider for these entities) already makes a stray write structurally
 * difficult. Defense-in-depth instead comes from: (1)
 * `ck_inv_stock_balance_qty_nonneg` (BR-INV-01's DB-layer floor), (2)
 * `trg_inv_movement_immutable` above, and (3)
 * `InvStockBalanceRepository.findByIdForUpdate()`'s row-lock discipline —
 * all enforced from application code with no other entry point registered
 * anywhere in the DI graph.
 *
 * **BR-INV-03 (stock-take freeze between snapshot and posting) is
 * deliberately NOT a DB trigger** — see `InvStockTakeEntity`'s own doc
 * comment for the full reasoning (the `scope` jsonb selector makes a
 * generic DB-level check impractical; this is a documented service-layer
 * concern for the next pass, the same class of judgement call BR-PROC-04's
 * "allocation <= invoice open balance" half made in migration `0100`).
 */
export class CreateInventoryTables0110 implements MigrationInterface {
  name = "CreateInventoryTables1700000000110";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.inv_category (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        parent_id uuid NULL,
        CONSTRAINT uq_inv_category_name UNIQUE (name),
        CONSTRAINT fk_inv_category_parent_id FOREIGN KEY (parent_id)
          REFERENCES app.inv_category(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_store (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        location varchar(120) NOT NULL,
        keeper_user_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_inv_store_name UNIQUE (name),
        CONSTRAINT fk_inv_store_keeper_user_id FOREIGN KEY (keeper_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_item (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        code varchar(30) NOT NULL,
        name varchar(120) NOT NULL,
        category_id uuid NOT NULL,
        uom varchar(20) NOT NULL,
        uom_conversions jsonb NULL,
        barcode varchar(60) NULL,
        item_type varchar(12) NOT NULL,
        reorder_level numeric(14,4) NULL,
        reorder_qty numeric(14,4) NULL,
        preferred_supplier_ids uuid[] NULL,
        gl_asset_account_id uuid NOT NULL,
        gl_expense_account_id uuid NOT NULL,
        gl_income_account_id uuid NULL,
        sale_price numeric(18,4) NULL,
        avg_cost numeric(18,6) NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_inv_item_code UNIQUE (code),
        CONSTRAINT fk_inv_item_category_id FOREIGN KEY (category_id)
          REFERENCES app.inv_category(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_item_gl_asset_account_id FOREIGN KEY (gl_asset_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_item_gl_expense_account_id FOREIGN KEY (gl_expense_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_item_gl_income_account_id FOREIGN KEY (gl_income_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_item_type CHECK (item_type IN ('STOCK','CONSUMABLE','SERVICE','RESALE')),
        CONSTRAINT ck_inv_item_resale_requires_price_and_income CHECK (
          item_type <> 'RESALE' OR (sale_price IS NOT NULL AND gl_income_account_id IS NOT NULL)
        )
      )
    `);
    // DDL's own `ix: GIN trgm(name)` — pg_trgm enabled in migration 0001.
    await queryRunner.query(`
      CREATE INDEX ix_inv_item_name_trgm ON app.inv_item USING GIN (name gin_trgm_ops)
    `);
    // DDL's own named `ix_inv_item_barcode` — partial unique over non-NULL barcodes (nullable UNIQUE, same shape as uq_wall_transaction_idempotency_key).
    await queryRunner.query(`
      CREATE UNIQUE INDEX ix_inv_item_barcode ON app.inv_item (barcode) WHERE barcode IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_stock_balance (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        item_id uuid NOT NULL,
        store_id uuid NOT NULL,
        qty numeric(14,4) NOT NULL DEFAULT 0,
        value numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_inv_stock_balance_item_store UNIQUE (item_id, store_id),
        CONSTRAINT fk_inv_stock_balance_item_id FOREIGN KEY (item_id)
          REFERENCES app.inv_item(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_stock_balance_store_id FOREIGN KEY (store_id)
          REFERENCES app.inv_store(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_stock_balance_qty_nonneg CHECK (qty >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_movement (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        item_id uuid NOT NULL,
        store_id uuid NOT NULL,
        movement_type varchar(12) NOT NULL,
        qty numeric(14,4) NOT NULL,
        unit_cost numeric(18,6) NOT NULL,
        value numeric(18,4) NOT NULL,
        ref_doc_type varchar(30) NOT NULL,
        ref_doc_id uuid NOT NULL,
        department_id uuid NULL,
        journal_id uuid NULL,
        at timestamptz NOT NULL,
        CONSTRAINT fk_inv_movement_item_id FOREIGN KEY (item_id)
          REFERENCES app.inv_item(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_movement_store_id FOREIGN KEY (store_id)
          REFERENCES app.inv_store(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_movement_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_movement_type CHECK (movement_type IN
          ('RECEIPT','ISSUE','SALE','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','RETURN')),
        CONSTRAINT ck_inv_movement_qty_nonzero CHECK (qty <> 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_inv_movement_item_store_at ON app.inv_movement (item_id, store_id, at DESC)`,
    );
    // Multi-year append-only table axis — BRIN per docs/phase-4/01-standards-and-migrations.md §6.
    await queryRunner.query(`CREATE INDEX ix_inv_movement_at_brin ON app.inv_movement USING BRIN (at)`);

    await queryRunner.query(`
      CREATE TABLE app.inv_transfer (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        from_store_id uuid NOT NULL,
        to_store_id uuid NOT NULL,
        status varchar(12) NOT NULL,
        issued_by uuid NOT NULL,
        received_by uuid NULL,
        CONSTRAINT uq_inv_transfer_number UNIQUE (number),
        CONSTRAINT fk_inv_transfer_from_store_id FOREIGN KEY (from_store_id)
          REFERENCES app.inv_store(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_transfer_to_store_id FOREIGN KEY (to_store_id)
          REFERENCES app.inv_store(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_transfer_issued_by FOREIGN KEY (issued_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_transfer_received_by FOREIGN KEY (received_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_transfer_status CHECK (status IN ('ISSUED','IN_TRANSIT','RECEIVED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_transfer_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        transfer_id uuid NOT NULL,
        line_no int NOT NULL,
        item_id uuid NOT NULL,
        qty numeric(14,4) NOT NULL,
        unit_cost numeric(18,6) NOT NULL,
        CONSTRAINT fk_inv_transfer_line_transfer_id FOREIGN KEY (transfer_id)
          REFERENCES app.inv_transfer(id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_transfer_line_item_id FOREIGN KEY (item_id)
          REFERENCES app.inv_item(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_transfer_line_qty_positive CHECK (qty > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_inv_transfer_line_transfer ON app.inv_transfer_line (transfer_id)`);

    await queryRunner.query(`
      CREATE TABLE app.inv_stock_take (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        store_id uuid NOT NULL,
        scope jsonb NOT NULL,
        snapshot_at timestamptz NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        CONSTRAINT uq_inv_stock_take_number UNIQUE (number),
        CONSTRAINT fk_inv_stock_take_store_id FOREIGN KEY (store_id)
          REFERENCES app.inv_store(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_stock_take_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inv_stock_take_status CHECK (status IN
          ('OPEN','COUNTING','REVIEW','PENDING_APPROVAL','POSTED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.inv_stock_take_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        stock_take_id uuid NOT NULL,
        item_id uuid NOT NULL,
        snapshot_qty numeric(14,4) NOT NULL,
        counted_qty numeric(14,4) NULL,
        variance_qty numeric(14,4) GENERATED ALWAYS AS (counted_qty - snapshot_qty) STORED,
        variance_value numeric(18,4) NULL,
        CONSTRAINT fk_inv_stock_take_line_stock_take_id FOREIGN KEY (stock_take_id)
          REFERENCES app.inv_stock_take(id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_stock_take_line_item_id FOREIGN KEY (item_id)
          REFERENCES app.inv_item(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_inv_stock_take_line_stock_take ON app.inv_stock_take_line (stock_take_id)`);

    // --- Trigger: trg_inv_movement_immutable --------------------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_inv_movement_immutable() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'inv_movement is an append-only audit ledger — row % may never be deleted', OLD.id
            USING ERRCODE = '23514';
        ELSE
          RAISE EXCEPTION 'inv_movement is an append-only audit ledger — row % may never be updated', OLD.id
            USING ERRCODE = '23514';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_inv_movement_immutable
        BEFORE UPDATE OR DELETE ON app.inv_movement
        FOR EACH ROW EXECUTE FUNCTION app.fn_inv_movement_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_inv_movement_immutable ON app.inv_movement`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_inv_movement_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_stock_take_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_stock_take`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_transfer_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_transfer`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_movement`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_stock_balance`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_item`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_store`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.inv_category`);
  }
}
