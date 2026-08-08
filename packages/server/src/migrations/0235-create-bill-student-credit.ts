import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 12 (Part D — Credit Balance Forward backend). `bill_student_credit`
 * — one row per student, the N-1 balance CACHE for a student's "credit
 * balance forward" (docs/phase-1/SRS.md `FR-PAY-004`, the `P-10` posting-map
 * row in docs/phase-2/01-functional-requirements.md — documented since Phase
 * 1/2, never implemented until this pass). Mirrors `wall_wallet`'s own
 * "N-1 cache, one row per student" shape (migration `0090`) closely — same
 * `student_id UUID UNIQUE NOT NULL` FK to `std_student` (`ON DELETE
 * RESTRICT`), same `numeric(18,4) NOT NULL DEFAULT 0` balance column — with
 * ONE deliberate difference: a credit balance has NO overdraft concept
 * (unlike `wall_wallet.overdraft_limit`/`ck_wall_wallet_balance_floor`'s
 * `balance >= -overdraft_limit`), so `ck_bill_student_credit_balance_nonneg`
 * is a plain `balance >= 0` — this balance can never go negative, full stop.
 *
 * Owned by `domains/billing` (matches the `bill_` prefix and the
 * "auto-applied to a future invoice" purpose FR-PAY-004 describes) even
 * though every WRITE to this table is driven from `domains/payments`'
 * `ReceiptsService` (via the new `StudentCreditService` this pass also
 * adds) — `domains/billing` may NOT import `domains/payments`
 * (`module-deps.json`'s one-directional boundary, confirmed before writing
 * this), but `domains/payments` already imports `domains/billing`, the same
 * direction `ReceiptsService.applyInvoiceAllocation()` already reaches into
 * `bill_invoice`/`bill_installment` today.
 *
 * No `trg_*_closed_requires_zero`-style trigger here (unlike `wall_wallet`)
 * — a credit balance has no "closed" lifecycle state to protect; it simply
 * sits at whatever it is, forever, for as long as the student exists.
 */
export class CreateBillStudentCredit0235 implements MigrationInterface {
  name = "CreateBillStudentCredit1700000000235";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bill_student_credit (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        student_id uuid NOT NULL,
        balance numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_bill_student_credit_student_id UNIQUE (student_id),
        CONSTRAINT fk_bill_student_credit_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bill_student_credit_balance_nonneg CHECK (balance >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_student_credit`);
  }
}
