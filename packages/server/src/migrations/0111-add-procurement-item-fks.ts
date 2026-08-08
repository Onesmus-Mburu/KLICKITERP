import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes Module 12 (Procurement)'s flagged forward-reference gap: three
 * columns were left as loose `uuid` columns with no FK in Procurement's
 * foundation pass (migration `0100`) because `inv_item` didn't exist yet —
 * `proc_requisition_line.item_id`, `proc_quotation_line.item_id`,
 * `proc_po_line.item_id`. See each entity's own (now-superseded) doc
 * comment and `docs/phase-5/PROGRESS.md`'s Module 12 row / `module-deps.json`'s
 * `domains/procurement` entry, which names all three explicitly. Now that
 * `inv_item` exists (migration `0110`), add the real FKs. `ON DELETE
 * RESTRICT` matches this codebase's default FK mode (an item referenced by
 * historical requisition/quotation/PO lines cannot be deleted out from under
 * them).
 *
 * All three columns stay **nullable** — a requisition/quotation/PO line may
 * legitimately have no `item_id` (a free-text line, per
 * `ck_proc_requisition_line_item_or_free_text`, or a `description`-only PO
 * line) — this migration only adds referential integrity for the non-NULL
 * case, it does not change nullability.
 *
 * This closure also finally makes Procurement's dormant P-18 GL-posting
 * branch reachable: `gl-grn-accounts.util.ts`'s `resolveInventoryControlAccount()`
 * (P-18, stock items with `item_id` set) was built correctly in Pass A but
 * was unreachable dead code until now, since every `proc_po_line.item_id`
 * was NULL with `inv_item` not existing to populate it from. The next
 * pass building Inventory's application layer should double-check/exercise
 * this branch once PO lines can carry a real `item_id` (create a PO line
 * against a `STOCK`/`RESALE` item, receive it via GRN, and assert the GRN
 * posts to the `INVENTORY` control account rather than the `5050`
 * Procurement Expense/Asset WIP fallback).
 */
export class AddProcurementItemFks0111 implements MigrationInterface {
  name = "AddProcurementItemFks1700000000111";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.proc_requisition_line
        ADD CONSTRAINT fk_proc_requisition_line_item_id FOREIGN KEY (item_id)
        REFERENCES app.inv_item(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_quotation_line
        ADD CONSTRAINT fk_proc_quotation_line_item_id FOREIGN KEY (item_id)
        REFERENCES app.inv_item(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_po_line
        ADD CONSTRAINT fk_proc_po_line_item_id FOREIGN KEY (item_id)
        REFERENCES app.inv_item(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.proc_po_line
        DROP CONSTRAINT IF EXISTS fk_proc_po_line_item_id
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_quotation_line
        DROP CONSTRAINT IF EXISTS fk_proc_quotation_line_item_id
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_requisition_line
        DROP CONSTRAINT IF EXISTS fk_proc_requisition_line_item_id
    `);
  }
}
