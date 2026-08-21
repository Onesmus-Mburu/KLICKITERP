import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes the last of the 3 flagged Phase-5-era forward-reference gaps:
 * `bill_refund_voucher.b2c_transaction_id` was left as a loose `uuid` column
 * with no FK in Module 9 (Billing)'s foundation pass because
 * `pay_mpesa_transaction` (Module 10/Payments) didn't exist yet — see
 * `BillRefundVoucherEntity`'s doc comment (pre-this-migration) and
 * `docs/phase-5/PROGRESS.md`'s Module 9/10 rows. Same closing pattern
 * Module 9 itself already used once, for `std_student.sponsor_id`/
 * `.transport_route_id` (migration `0071`), and Module 11 used again for
 * `pay_mpesa_transaction.wallet_transaction_id` (migration `0091`).
 * `ON DELETE RESTRICT` matches this codebase's default FK mode.
 *
 * No `bill_refund_voucher` rows have a non-null `b2c_transaction_id` in any
 * environment checked before this migration was written (a real B2C refund
 * payout flow was never exercised against live Payments data), so this is
 * a plain `ADD CONSTRAINT` with no pre-cleanup step needed.
 */
export class AddRefundVoucherMpesaTxnFk0243 implements MigrationInterface {
  name = "AddRefundVoucherMpesaTxnFk1700000000243";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.bill_refund_voucher
        ADD CONSTRAINT fk_bill_refund_voucher_b2c_transaction FOREIGN KEY (b2c_transaction_id)
        REFERENCES app.pay_mpesa_transaction(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.bill_refund_voucher
        DROP CONSTRAINT IF EXISTS fk_bill_refund_voucher_b2c_transaction
    `);
  }
}
