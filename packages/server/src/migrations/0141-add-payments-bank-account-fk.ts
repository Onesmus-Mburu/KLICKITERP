import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes Module 10 (Payments)'s flagged forward-reference gap:
 * `pay_receipt_split.bank_account_id` was left as a loose `uuid` column with
 * no FK in the foundation pass (migration `0080`) because `bank_account`
 * didn't exist yet — see `PayReceiptSplitEntity`'s (now-superseded) doc
 * comment and `docs/phase-5/PROGRESS.md`'s Module 10 row / `module-deps.json`'s
 * `domains/payments` entry, which names this gap explicitly. Now that
 * `bank_account` exists (migration `0140`), add the real FK. `ON DELETE
 * RESTRICT` matches this codebase's default FK mode. The column stays
 * **nullable** — a cash/cheque/M-Pesa split legitimately has no bank
 * account — this migration only adds referential integrity for the non-NULL
 * case, it does not change nullability.
 */
export class AddPaymentsBankAccountFk0141 implements MigrationInterface {
  name = "AddPaymentsBankAccountFk1700000000141";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_receipt_split
        ADD CONSTRAINT fk_pay_receipt_split_bank_account_id FOREIGN KEY (bank_account_id)
        REFERENCES app.bank_account(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_receipt_split
        DROP CONSTRAINT IF EXISTS fk_pay_receipt_split_bank_account_id
    `);
  }
}
