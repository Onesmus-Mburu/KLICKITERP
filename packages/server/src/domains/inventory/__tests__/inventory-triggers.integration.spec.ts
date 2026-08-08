import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { InvCategoryEntity } from "../domain/inv-category.entity";
import { InvStoreEntity } from "../domain/inv-store.entity";
import { InvItemEntity } from "../domain/inv-item.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { InvMovementEntity } from "../domain/inv-movement.entity";
import { InvTransferEntity } from "../domain/inv-transfer.entity";
import { InvTransferLineEntity } from "../domain/inv-transfer-line.entity";
import { InvStockTakeEntity } from "../domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/procurement/__tests__/procurement-triggers.integration.spec.ts`'s
 * pattern exactly — the highest-value test in this foundation pass, since
 * the trigger from migration `0110` and the `GENERATED ALWAYS` column can
 * only be genuinely verified against a real Postgres, not a mocked
 * repository.
 */
describe("inventory module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[inventory-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface ItemFixture {
    categoryId: string;
    storeId: string;
    itemId: string;
    keeperUserId: string;
    assetAccountId: string;
    expenseAccountId: string;
  }

  async function createItemFixture(source: DataSource, suffix: string): Promise<ItemFixture> {
    const categoryId = generateUuidV7();
    const storeId = generateUuidV7();
    const itemId = generateUuidV7();
    const keeperUserId = generateUuidV7();
    const assetAccountId = generateUuidV7();
    const expenseAccountId = generateUuidV7();

    await source.query(`INSERT INTO app.inv_category (id, name) VALUES ($1, $2)`, [
      categoryId,
      `INV-CAT-${suffix}`,
    ]);
    await source.query(
      `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
       VALUES ($1, $2, 'hash', 'Test Keeper', 'ACTIVE', $3)`,
      [keeperUserId, `inv-keeper-${suffix}`, `+2547${suffix}`],
    );
    await source.query(
      `INSERT INTO app.inv_store (id, name, location, keeper_user_id) VALUES ($1, $2, 'Main Campus', $3)`,
      [storeId, `INV-STORE-${suffix}`, keeperUserId],
    );
    // is_postable=false (no parent_id) satisfies ck_gl_account_postable_needs_parent without needing a parent
    // chain — this fixture only needs a valid gl_account row for the FK target, postability is irrelevant here.
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, is_active)
       VALUES ($1, $2, 'Inventory Asset', 'ASSET', false, false, true)`,
      [assetAccountId, `1300-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, is_active)
       VALUES ($1, $2, 'COGS', 'EXPENSE', false, false, true)`,
      [expenseAccountId, `5300-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.inv_item
         (id, code, name, category_id, uom, item_type, gl_asset_account_id, gl_expense_account_id)
       VALUES ($1, $2, 'Test Item', $3, 'EACH', 'STOCK', $4, $5)`,
      [itemId, `ITEM-${suffix}`, categoryId, assetAccountId, expenseAccountId],
    );

    return { categoryId, storeId, itemId, keeperUserId, assetAccountId, expenseAccountId };
  }

  async function destroyItemFixture(source: DataSource, fixture: ItemFixture): Promise<void> {
    await source.query(`DELETE FROM app.inv_item WHERE id = $1`, [fixture.itemId]);
    await source.query(`DELETE FROM app.inv_store WHERE id = $1`, [fixture.storeId]);
    await source.query(`DELETE FROM app.gl_account WHERE id IN ($1, $2)`, [
      fixture.assetAccountId,
      fixture.expenseAccountId,
    ]);
    await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [fixture.keeperUserId]);
    await source.query(`DELETE FROM app.inv_category WHERE id = $1`, [fixture.categoryId]);
  }

  it.each([
    ["inv_category", InvCategoryEntity],
    ["inv_store", InvStoreEntity],
    ["inv_item", InvItemEntity],
    ["inv_stock_balance", InvStockBalanceEntity],
    ["inv_movement", InvMovementEntity],
    ["inv_transfer", InvTransferEntity],
    ["inv_transfer_line", InvTransferLineEntity],
    ["inv_stock_take", InvStockTakeEntity],
    ["inv_stock_take_line", InvStockTakeLineEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[inventory-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_inv_movement_immutable rejects UPDATE and DELETE unconditionally on the append-only movement ledger", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[inventory-triggers.integration.spec] SKIPPED (no DB) — movement immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const fixture = await createItemFixture(source, suffix);
    const movementId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.inv_movement
           (id, item_id, store_id, movement_type, qty, unit_cost, value, ref_doc_type, ref_doc_id, at)
         VALUES ($1, $2, $3, 'RECEIPT', 10.0000, 100.000000, 1000.00, 'TEST_DOC', $4, now())`,
        [movementId, fixture.itemId, fixture.storeId, generateUuidV7()],
      );

      await expect(
        source.query(`UPDATE app.inv_movement SET qty = 20.0000 WHERE id = $1`, [movementId]),
      ).rejects.toThrow(/append-only/);

      await expect(source.query(`DELETE FROM app.inv_movement WHERE id = $1`, [movementId])).rejects.toThrow(
        /append-only/,
      );
    } finally {
      // The row is genuinely un-deletable through normal DML once trg_inv_movement_immutable is active (that is
      // the whole point of this trigger) — a plain `DELETE` here would itself throw and mask the test's real
      // outcome. Disable the trigger for this cleanup statement only, then re-enable it immediately, rather than
      // leaving a uniquely-suffixed orphan row behind on every test run.
      await source.query(`ALTER TABLE app.inv_movement DISABLE TRIGGER trg_inv_movement_immutable`);
      try {
        await source.query(`DELETE FROM app.inv_movement WHERE id = $1`, [movementId]);
      } finally {
        await source.query(`ALTER TABLE app.inv_movement ENABLE TRIGGER trg_inv_movement_immutable`);
      }
      await destroyItemFixture(source, fixture);
    }
  });

  it("inv_stock_take_line.variance_qty is a real GENERATED STORED column computed as counted_qty - snapshot_qty", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[inventory-triggers.integration.spec] SKIPPED (no DB) — generated variance_qty column check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const fixture = await createItemFixture(source, suffix);
    const stockTakeId = generateUuidV7();
    const lineId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.inv_stock_take (id, number, store_id, scope, snapshot_at, status)
         VALUES ($1, $2, $3, '{}'::jsonb, now(), 'COUNTING')`,
        [stockTakeId, `ST-${suffix}`, fixture.storeId],
      );

      // Before counting: counted_qty is NULL, so variance_qty must also be NULL (NULL arithmetic).
      await source.query(
        `INSERT INTO app.inv_stock_take_line (id, stock_take_id, item_id, snapshot_qty)
         VALUES ($1, $2, $3, 50.0000)`,
        [lineId, stockTakeId, fixture.itemId],
      );
      const [beforeCount] = await source.query(
        `SELECT variance_qty FROM app.inv_stock_take_line WHERE id = $1`,
        [lineId],
      );
      expect(beforeCount.variance_qty).toBeNull();

      // Counting fills in counted_qty — variance_qty recomputes automatically (Postgres-generated, never set by us).
      await source.query(`UPDATE app.inv_stock_take_line SET counted_qty = 47.0000 WHERE id = $1`, [lineId]);
      const [afterCount] = await source.query(
        `SELECT snapshot_qty, counted_qty, variance_qty FROM app.inv_stock_take_line WHERE id = $1`,
        [lineId],
      );
      expect(Number(afterCount.variance_qty)).toBeCloseTo(-3, 4);
      expect(Number(afterCount.variance_qty)).toBeCloseTo(
        Number(afterCount.counted_qty) - Number(afterCount.snapshot_qty),
        4,
      );

      // Directly writing variance_qty must fail — it is a STORED generated column, not an ordinary one.
      await expect(
        source.query(`UPDATE app.inv_stock_take_line SET variance_qty = 999.0000 WHERE id = $1`, [lineId]),
      ).rejects.toThrow();
    } finally {
      await source.query(`DELETE FROM app.inv_stock_take_line WHERE id = $1`, [lineId]);
      await source.query(`DELETE FROM app.inv_stock_take WHERE id = $1`, [stockTakeId]);
      await destroyItemFixture(source, fixture);
    }
  });
});
