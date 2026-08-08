import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BillFeeCategoryEntity } from "./bill-fee-category.entity";
import { BillCreditNoteEntity } from "./bill-credit-note.entity";

/**
 * Maps to `bill_credit_note_line` (docs/phase-4/03-schema-student-finance.md
 * §3) — mirrors `bill_invoice_line`'s shape (`line_no`/`fee_category_id`/
 * `description`/`amount`), minus `concession_amount` (not meaningful on a
 * note line). `MutableBaseEntity` — same judgement as `bill_fee_structure_line`:
 * lines are freely edited while the parent note sits in `DRAFT`, frozen in
 * practice once submitted for approval (application-layer guard in the next
 * pass; no DB trigger names this table in this foundation pass — only the 3
 * triggers explicitly scoped by the task brief exist here).
 */
@Entity("bill_credit_note_line")
@Check("ck_bill_credit_note_line_amount_nonneg", `"amount" >= 0`)
export class BillCreditNoteLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "credit_note_id" })
  creditNoteId!: string;

  @ManyToOne(() => BillCreditNoteEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_note_id" })
  creditNote?: BillCreditNoteEntity;

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
