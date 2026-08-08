import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes Module 12 (Procurement)'s flagged forward-reference gap: two
 * columns were left as loose `uuid` columns with no FK in Procurement's
 * foundation pass (migration `0100`) because `bank_account`/
 * `bank_cheque_leaf` didn't exist yet — `proc_payment_voucher.
 * bank_account_id` and `proc_payment_voucher.cheque_leaf_id`. See
 * `ProcPaymentVoucherEntity`'s (now-superseded) doc comment and
 * `docs/phase-5/PROGRESS.md`'s Module 12 row / `module-deps.json`'s
 * `domains/procurement` entry, which names this gap explicitly. Now that
 * `bank_account`/`bank_cheque_leaf` exist (migration `0140`), add both real
 * FKs. `ON DELETE RESTRICT` matches this codebase's default FK mode. Both
 * columns stay **nullable** — a `CASH`/`MPESA` payment voucher legitimately
 * has neither a bank account nor a cheque leaf — this migration only adds
 * referential integrity for the non-NULL case, it does not change
 * nullability.
 *
 * Note the OTHER direction of this same relationship —
 * `bank_cheque_leaf.voucher_id -> proc_payment_voucher` — was built as a
 * real FK from day one in migration `0140` itself (Procurement already
 * existed when Banking's foundation pass ran), so this migration only needs
 * to add the two columns living on `proc_payment_voucher`.
 */
export class AddProcurementBankFks0142 implements MigrationInterface {
  name = "AddProcurementBankFks1700000000142";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.proc_payment_voucher
        ADD CONSTRAINT fk_proc_payment_voucher_bank_account_id FOREIGN KEY (bank_account_id)
        REFERENCES app.bank_account(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_payment_voucher
        ADD CONSTRAINT fk_proc_payment_voucher_cheque_leaf_id FOREIGN KEY (cheque_leaf_id)
        REFERENCES app.bank_cheque_leaf(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.proc_payment_voucher
        DROP CONSTRAINT IF EXISTS fk_proc_payment_voucher_cheque_leaf_id
    `);
    await queryRunner.query(`
      ALTER TABLE app.proc_payment_voucher
        DROP CONSTRAINT IF EXISTS fk_proc_payment_voucher_bank_account_id
    `);
  }
}
