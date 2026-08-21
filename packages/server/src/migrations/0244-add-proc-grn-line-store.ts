import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes the GRN->Inventory wiring gap flagged since Module 13 (Inventory)'s
 * own foundation pass and restated in `module-deps.json`'s `domains/inventory`
 * entry ("Procurement-GRN stretch-goal integration ... NOT attempted"):
 * `GrnService.post()`'s P-18 branch (stock items, `proc_po_line.item_id`
 * set) computed a GL debit against the Inventory control account but never
 * actually called `StockMovementsService.recordReceipt()` — real stock
 * never entered `inv_stock_balance`/`inv_movement` for a received GRN line.
 * The reason it was never wired: `StockMovementsService.recordReceipt()`
 * requires a `storeId` (which physical store the goods land in), and
 * `proc_grn_line` had no such column at all — not an import-boundary gap
 * (`domains/inventory` was already in `domains/procurement`'s `mayImport`
 * list, added by migration `0111` for the `item_id` FKs).
 *
 * Adds `store_id` — nullable at the schema level (a P-19/non-stock GRN line
 * has no meaningful store; `inv_store` doesn't apply to it at all), but
 * `GrnService.receive()` now REQUIRES it whenever the underlying
 * `proc_po_line.item_id` is set, matching the user's explicit choice of
 * "explicit store per GRN line" over a single header-level store default —
 * one delivery can genuinely need to split across stores/warehouses.
 * `ON DELETE RESTRICT` matches this codebase's default FK mode.
 */
export class AddProcGrnLineStore0244 implements MigrationInterface {
  name = "AddProcGrnLineStore1700000000244";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.proc_grn_line ADD COLUMN store_id uuid NULL`);
    await queryRunner.query(`
      ALTER TABLE app.proc_grn_line
        ADD CONSTRAINT fk_proc_grn_line_store FOREIGN KEY (store_id)
        REFERENCES app.inv_store(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.proc_grn_line DROP CONSTRAINT IF EXISTS fk_proc_grn_line_store`);
    await queryRunner.query(`ALTER TABLE app.proc_grn_line DROP COLUMN IF EXISTS store_id`);
  }
}
