import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes Module 10 (Payments)'s flagged forward-reference gap:
 * `pay_mpesa_transaction.wallet_transaction_id` was left as a loose `uuid`
 * column with no FK in the foundation pass (migration `0080`) because
 * `wall_transaction` didn't exist yet — see `PayMpesaTransactionEntity`'s
 * doc comment (pre-this-migration) and `docs/phase-5/PROGRESS.md`'s Module
 * 10 row. Now that `wall_transaction` exists (migration `0090`), add the
 * real FK. `ON DELETE RESTRICT` matches this codebase's default FK mode.
 */
export class AddMpesaWalletTxnFk0091 implements MigrationInterface {
  name = "AddMpesaWalletTxnFk1700000000091";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_mpesa_transaction
        ADD CONSTRAINT fk_pay_mpesa_transaction_wallet_txn FOREIGN KEY (wallet_transaction_id)
        REFERENCES app.wall_transaction(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.pay_mpesa_transaction
        DROP CONSTRAINT IF EXISTS fk_pay_mpesa_transaction_wallet_txn
    `);
  }
}
