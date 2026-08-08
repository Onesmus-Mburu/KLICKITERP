import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BillFeeCategoryEntity } from "./bill-fee-category.entity";
import { BillDebitNoteEntity } from "./bill-debit-note.entity";

/**
 * Maps to `bill_debit_note_line` (docs/phase-4/03-schema-student-finance.md
 * §3) — mirrors `bill_invoice_line`'s shape, same as `bill_credit_note_line`.
 * `MutableBaseEntity` — same judgement as `bill_credit_note_line`.
 */
@Entity("bill_debit_note_line")
@Check("ck_bill_debit_note_line_amount_nonneg", `"amount" >= 0`)
export class BillDebitNoteLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "debit_note_id" })
  debitNoteId!: string;

  @ManyToOne(() => BillDebitNoteEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "debit_note_id" })
  debitNote?: BillDebitNoteEntity;

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
}
