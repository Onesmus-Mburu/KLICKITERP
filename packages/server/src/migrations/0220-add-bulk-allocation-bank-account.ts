import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 7 — fixes a real, verification-blocking bug found live in
 * Slice 6 (`docs/phase-6/PROGRESS.md`'s Slice 6 section, "A real,
 * previously-undocumented, verification-blocking backend bug found live"):
 * `BulkAllocationService.matchAndPost()` fabricated
 * `bankAccountId: \`bulk-batch-${batchId}\`` — a non-UUID string — for every
 * line's `pay_receipt_split.bank_account_id`, a real `uuid` FK column
 * (`fk_pay_receipt_split_bank_account_id`, migration `0141`). Every capture
 * attempt failed outright, and the `catch` block meant to gracefully park a
 * failed line into suspense hit the SAME class of failure on
 * `pay_suspense_item.external_ref` (a real `varchar(60)` column, the
 * fabricated `\`bulk-batch-${batchId}-line-${line.id}\`` string running
 * ~89 characters) — so the error was never actually caught, it propagated
 * out as an uncaught `500`.
 *
 * The real fix (this migration's half of it): a bulk-allocation batch must
 * declare ONE real bank account up front, at batch-creation time — every
 * line in the batch is captured as a `BANK_TRANSFER` split against that same
 * account (mirrors `pay_receipt_split.bank_account_id`'s own real FK to
 * `bank_account`, migration `0141` — same `ON DELETE RESTRICT` mode, this
 * codebase's FK default). `BulkAllocationService`'s own code fix
 * (`application/bulk-allocation.service.ts`) threads `batch.bankAccountId`
 * through instead of the fabricated string, and shortens `externalRef` to
 * just `line.id` (already a globally-unique UUID, 36 chars, well under 60).
 *
 * **Backfill**: confirmed live (not assumed) that this table already has 2
 * real rows in this dev environment — both stuck at `status='MATCHING'`
 * forever, residue from Slice 6's own verification hitting this exact bug
 * (`docker exec ... psql ... SELECT id, status FROM app.pay_bulk_allocation_batch`
 * → both `MATCHING`, `created_receipts=0`, 2 lines each, `receipt_id IS
 * NULL`). Real financial-adjacent residue, per this codebase's own
 * "immutable financial records stay as residue" precedent (Slice 4/5/6) — not
 * deleted. Backfilled from the first real, active `kind='BANK'` row in
 * `bank_account` (`ORDER BY created_at LIMIT 1` — in this dev environment
 * that resolves to "Main Operating Account", `019f8b20-...`, the same real
 * account every prior Payments slice's own live verification has reused). A
 * fresh deployment with zero pre-existing `pay_bulk_allocation_batch` rows
 * backfills nothing (the `UPDATE` is a no-op) and the subsequent `SET NOT
 * NULL` succeeds trivially — the subquery-based backfill is only ever
 * exercised when real pre-existing rows need it, matching migration `0210`'s
 * own "ADD nullable -> backfill -> SET NOT NULL -> ADD FK" phased shape. If a
 * deployment somehow has real batch rows but zero `bank_account` rows at all,
 * the backfill subquery returns NULL and `SET NOT NULL` fails loudly — a
 * correct, intentional guardrail (that data state is already inconsistent),
 * not a bug to route around.
 */
export class AddBulkAllocationBankAccount0220 implements MigrationInterface {
  name = "AddBulkAllocationBankAccount1700000000220";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_bulk_allocation_batch
        ADD COLUMN bank_account_id uuid NULL
    `);

    await queryRunner.query(`
      UPDATE app.pay_bulk_allocation_batch
        SET bank_account_id = (SELECT id FROM app.bank_account WHERE kind = 'BANK' ORDER BY created_at LIMIT 1)
        WHERE bank_account_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE app.pay_bulk_allocation_batch
        ALTER COLUMN bank_account_id SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE app.pay_bulk_allocation_batch
        ADD CONSTRAINT fk_pay_bulk_allocation_batch_bank_account_id FOREIGN KEY (bank_account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_bulk_allocation_batch
        DROP CONSTRAINT IF EXISTS fk_pay_bulk_allocation_batch_bank_account_id
    `);
    await queryRunner.query(`
      ALTER TABLE app.pay_bulk_allocation_batch
        DROP COLUMN IF EXISTS bank_account_id
    `);
  }
}
