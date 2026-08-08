import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BillInvoiceEntity } from "./bill-invoice.entity";

/**
 * Maps to `bill_installment` (docs/phase-4/03-schema-student-finance.md §3)
 * — an installment-plan row against a `bill_invoice`. `MutableBaseEntity` —
 * the clearest real post-creation update path of any table in this module:
 * `settled_amount` is incremented every time a payment/allocation applies
 * against this installment (Module 10/Payments, not built yet), long after
 * the row is first created.
 *
 * `trg_bill_installments_sum` (migration `0070`) is a `DEFERRABLE INITIALLY
 * DEFERRED` constraint trigger asserting `SUM(amount)` for all installments
 * of an invoice equals that invoice's `balance` **at the time the plan is
 * created** (BR-BILL-05) — it only re-validates the sum after any
 * INSERT/UPDATE/DELETE touching the `amount` column set, it does not pin the
 * invoice's balance forever (a later partial payment naturally leaves
 * `SUM(amount) > invoice.balance` and is not what this trigger polices —
 * see the migration's doc comment for the exact scope).
 */
@Entity("bill_installment")
@Index("uq_bill_installment_invoice_seq", ["invoiceId", "seq"], { unique: true })
@Check("ck_bill_installment_amount_positive", `"amount" > 0`)
export class BillInstallmentEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "invoice_id" })
  invoiceId!: string;

  @ManyToOne(() => BillInvoiceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity;

  @Column({ type: "int", name: "seq" })
  seq!: number;

  @Column({ type: "date", name: "due_date" })
  dueDate!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "settled_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  settledAmount!: Money;
}
