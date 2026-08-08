import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from their entity files, not `domains/billing`'s barrel
// — same circular-require-avoidance discipline Module 9 established for its
// own cross-domain FK imports (see `BillInvoiceEntity`'s import comment).
import { BillInvoiceEntity } from "../../billing/domain/bill-invoice.entity";
import { BillInstallmentEntity } from "../../billing/domain/bill-installment.entity";
import { PayReceiptEntity } from "./pay-receipt.entity";

/**
 * Maps to `pay_receipt_allocation` (docs/phase-4/03-schema-student-finance.md
 * §4) — one invoice/installment/prepayment allocation line of a
 * `pay_receipt`'s total. Module 10 (Payments) **foundation pass only**
 * (docs/phase-5/PROGRESS.md).
 *
 * **Base-class judgement call**: same reasoning as `PayReceiptSplitEntity`
 * — `pay_receipt` has no `DRAFT` status, so allocation rows are written
 * atomically with the receipt at capture time and never edited afterward
 * (the DDL's "prepayment rows update student credit" note describes a
 * downstream side effect on `std_ledger_entry`/the student's credit
 * position, not an in-place update of this row itself). Plain `BaseEntity`
 * (append-only), a documented divergence from `bill_invoice_line`'s
 * `MutableBaseEntity` precedent for the same reason given there.
 *
 * `trg_pay_allocations_sum` (migration `0080`, BR-PAY-03 — "a receipt can
 * never leave unallocated floating money") is a `DEFERRABLE INITIALLY
 * DEFERRED` constraint trigger asserting `SUM(amount)` for the affected
 * `receipt_id` equals that receipt's `total` at COMMIT.
 */
@Entity("pay_receipt_allocation")
@Check("ck_pay_receipt_allocation_amount_positive", `"amount" > 0`)
export class PayReceiptAllocationEntity extends BaseEntity {
  @Column({ type: "uuid", name: "receipt_id" })
  receiptId!: string;

  @ManyToOne(() => PayReceiptEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "receipt_id" })
  receipt?: PayReceiptEntity;

  @Column({ type: "uuid", name: "invoice_id", nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => BillInvoiceEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity | null;

  @Column({ type: "uuid", name: "installment_id", nullable: true })
  installmentId!: string | null;

  @ManyToOne(() => BillInstallmentEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "installment_id" })
  installment?: BillInstallmentEntity | null;

  @Column({ type: "boolean", name: "to_prepayment", default: false })
  toPrepayment!: boolean;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;
}
