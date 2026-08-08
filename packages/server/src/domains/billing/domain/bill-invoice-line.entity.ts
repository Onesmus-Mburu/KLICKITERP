import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BillFeeCategoryEntity } from "./bill-fee-category.entity";
import { BillInvoiceEntity } from "./bill-invoice.entity";

/**
 * Maps to `bill_invoice_line` (docs/phase-4/03-schema-student-finance.md §3)
 * — one category/amount line of a `bill_invoice`. `MutableBaseEntity` — a
 * real post-creation update path: `concession_amount` is written by the next
 * pass's concession-application flow *after* the line (and often the parent
 * invoice) already exists, independent of whatever status the parent
 * invoice is in — mirrors `bill_installment.settled_amount`'s allocation-path
 * shape, not `gl_journal_line`'s true immutable-after-insert shape (no
 * trigger in this pass names `bill_invoice_line` — only the parent
 * `bill_invoice`'s financial *header* columns are DB-frozen by
 * `trg_bill_invoice_immutable`).
 */
@Entity("bill_invoice_line")
@Check("ck_bill_invoice_line_amount_nonneg", `"amount" >= 0`)
@Check("ck_bill_invoice_line_concession_le_amount", `"concession_amount" <= "amount"`)
export class BillInvoiceLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "invoice_id" })
  invoiceId!: string;

  @ManyToOne(() => BillInvoiceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity;

  @Column({ type: "int", name: "line_no" })
  lineNo!: number;

  @Column({ type: "uuid", name: "fee_category_id" })
  feeCategoryId!: string;

  @ManyToOne(() => BillFeeCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_category_id" })
  feeCategory?: BillFeeCategoryEntity;

  @Column({ type: "varchar", length: 160, name: "description" })
  description!: string;

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
    name: "concession_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  concessionAmount!: Money;
}
