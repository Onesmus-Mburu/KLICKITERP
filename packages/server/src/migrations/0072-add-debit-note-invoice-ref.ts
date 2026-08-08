import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Module 9 (Billing) PASS B — a small follow-up migration closing two gaps
 * the foundation pass's `bill_debit_note` DDL left open, both needed for
 * `DebitNotesService.post()`'s design decision (see that service's class doc
 * comment): reuse `InvoicingService.generateInvoice()`/`.postInvoice()` to
 * realize P-07 rather than duplicating the posting engine.
 *
 *  - `invoice_id` (nullable, FK `RESTRICT` -> `bill_invoice`) — records which
 *    invoice `post()` generated once `status='POSTED'`; NULL while DRAFT.
 *    This is the column the task brief named explicitly.
 *  - `term_id` (nullable, FK `RESTRICT` -> `set_term`) — a necessary
 *    companion column not named in the task brief's own wording but required
 *    for `post()` to actually work: `bill_invoice.term_id` is NOT NULL, and
 *    `DebitNotesService.create(studentId, termId, ...)` accepts `termId` as
 *    an input with nowhere on the pre-`0072` DDL to persist it — deferring
 *    that capture to `post()` time is not possible since `create()` is a
 *    separate call, possibly much later. Both columns are additive/nullable,
 *    so this migration is a pure schema extension — no backfill needed (no
 *    `bill_debit_note` rows exist yet, PASS A never wrote any).
 */
export class AddDebitNoteInvoiceRef0072 implements MigrationInterface {
  name = "AddDebitNoteInvoiceRef1700000000072";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.bill_debit_note
        ADD COLUMN term_id uuid NULL,
        ADD COLUMN invoice_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_debit_note
        ADD CONSTRAINT fk_bill_debit_note_term FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_debit_note
        ADD CONSTRAINT fk_bill_debit_note_invoice FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_debit_note DROP CONSTRAINT IF EXISTS fk_bill_debit_note_invoice`);
    await queryRunner.query(`ALTER TABLE app.bill_debit_note DROP CONSTRAINT IF EXISTS fk_bill_debit_note_term`);
    await queryRunner.query(`
      ALTER TABLE app.bill_debit_note
        DROP COLUMN IF EXISTS invoice_id,
        DROP COLUMN IF EXISTS term_id
    `);
  }
}
