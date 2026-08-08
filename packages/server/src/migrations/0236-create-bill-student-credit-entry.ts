import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 12 (Part D — Credit Balance Forward backend).
 * `bill_student_credit_entry` — the append-only ledger backing
 * `bill_student_credit.balance` (migration `0235`), mirroring
 * `wall_transaction`'s own field SHAPE at Billing's smaller scale (per the
 * plan's own explicit instruction — borrow Wallet's ledger-row shape, not
 * Wallet's whole module pattern: no `journal_id`/`direction`/`items`/
 * `counterparty_*`/`service_point_id`/`approval_ref`/`reason_code`/
 * `idempotency_key`/`actor_id`/`at` columns here — this ledger is simpler
 * than `wall_transaction`'s, by design).
 *
 * `student_id` is a real, direct FK to `std_student` — NOT `credit_id` FKing
 * to `bill_student_credit` (unlike `wall_transaction.wallet_id ->
 * wall_wallet.id`'s indirection) — a deliberate simplification since
 * `bill_student_credit.student_id` is already UNIQUE (one row per student),
 * so a direct student reference carries the identical information one join
 * hop closer, and this is the plan's own explicitly specified shape.
 *
 * `type IN ('ISSUE','CONSUME')` — `ISSUE` when an overpayment
 * (`pay_receipt_allocation.to_prepayment = true`) is banked as credit
 * (`ReceiptsService.captureReceipt()`) or when a wrongly-issued credit is
 * clawed back on a receipt reversal that would otherwise leave the ledger
 * silently desynced from the credit balance is instead REJECTED (see
 * `StudentCreditService.netOutIssuedCredit()`'s own doc comment — that
 * netting-out path logs a `CONSUME` entry, not a negative `ISSUE`, since
 * `amount > 0` always and `type` alone carries the direction); `CONSUME`
 * when credit is applied to an invoice
 * (`ReceiptsService.applyStudentCreditToInvoices()`) or clawed back on
 * reversal.
 *
 * `receipt_id` — a REAL DB-level FK to `pay_receipt`, but the TypeORM entity
 * (`BillStudentCreditEntryEntity`, see its own doc comment) deliberately
 * carries NO `@ManyToOne`/entity-file import for it. This is NOT the same
 * "forward reference, FK added later once the target table exists" shape
 * `pay_mpesa_transaction.wallet_transaction_id` (migration `0080` -> `0091`)
 * or `pay_receipt_split.bank_account_id` (migration `0080` -> `0141`)
 * used — in both of those cases the gap was TEMPORARY (the target table
 * didn't exist yet) and closed later by adding the sibling module to the
 * referencing module's own `mayImport` list. Here, `pay_receipt` already
 * exists, but `domains/billing`'s `mayImport` list (`module-deps.json`)
 * deliberately does NOT and structurally MUST NOT ever include
 * `domains/payments` — `domains/payments` already imports `domains/billing`
 * (`BillInvoiceRepository`/`BillInstallmentRepository`/
 * `resolveControlAccount`), so the reverse import would be a real,
 * permanent module-dependency cycle, not a closable gap. The DB still
 * enforces real referential integrity via this migration's own `FOREIGN
 * KEY ... REFERENCES app.pay_receipt(id)` constraint; only the
 * TypeORM-navigable relation (and the `PayReceiptEntity` import it would
 * require) is permanently absent. A genuinely new pattern for this
 * codebase — no prior table needed "real DB FK, no entity relation,
 * forever" before this one.
 *
 * `invoice_id` — same domain as this table (`bill_invoice`), so a normal
 * real FK **with** a full `@ManyToOne` entity relation (no cross-domain
 * boundary issue at all here).
 */
export class CreateBillStudentCreditEntry0236 implements MigrationInterface {
  name = "CreateBillStudentCreditEntry1700000000236";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bill_student_credit_entry (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        student_id uuid NOT NULL,
        type varchar(7) NOT NULL,
        amount numeric(18,4) NOT NULL,
        balance_after numeric(18,4) NOT NULL,
        receipt_id uuid NULL,
        invoice_id uuid NULL,
        CONSTRAINT fk_bill_student_credit_entry_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_student_credit_entry_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_student_credit_entry_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_student_credit_entry_type CHECK (type IN ('ISSUE','CONSUME')),
        CONSTRAINT ck_bill_student_credit_entry_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bill_student_credit_entry_balance_after_nonneg CHECK (balance_after >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_bill_student_credit_entry_student_created ON app.bill_student_credit_entry (student_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_student_credit_entry`);
  }
}
