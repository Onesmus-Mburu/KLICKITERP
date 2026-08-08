import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/students`' barrel —
// same circular-require-avoidance discipline established throughout this
// module (see `PayReceiptEntity`'s import comment).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { PayBulkAllocationBatchEntity } from "./pay-bulk-allocation-batch.entity";
import { PayReceiptEntity } from "./pay-receipt.entity";

/**
 * Maps to `pay_bulk_allocation_batch_line` (docs/phase-4/03-schema-student-finance.md
 * §4, the `_line child (student, amount, receipt_id)` the DDL names for
 * `pay_bulk_allocation_batch`). Module 10 (Payments) **foundation pass
 * only** (docs/phase-5/PROGRESS.md).
 *
 * **Base-class judgement call** (diverges from `PayReceiptSplitEntity`/
 * `PayReceiptAllocationEntity`'s `BaseEntity` choice, for a documented
 * reason): `receipt_id` starts `NULL` at upload/parse time and is written in
 * place once the next pass's bulk-matching service resolves this line's
 * student/amount against an open invoice and creates (or matches) a
 * `pay_receipt` for it — a genuine post-creation update path, the same
 * shape `bill_invoice_line.concession_amount` has in
 * `domains/billing/domain/bill-invoice-line.entity.ts` (billing's own
 * documented precedent for when a "line" table legitimately needs
 * `MutableBaseEntity`). `MutableBaseEntity` accordingly.
 */
@Entity("pay_bulk_allocation_batch_line")
@Check("ck_pay_bulk_allocation_batch_line_amount_positive", `"amount" > 0`)
export class PayBulkAllocationBatchLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "batch_id" })
  batchId!: string;

  @ManyToOne(() => PayBulkAllocationBatchEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "batch_id" })
  batch?: PayBulkAllocationBatchEntity;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "uuid", name: "receipt_id", nullable: true })
  receiptId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "receipt_id" })
  receipt?: PayReceiptEntity | null;
}
