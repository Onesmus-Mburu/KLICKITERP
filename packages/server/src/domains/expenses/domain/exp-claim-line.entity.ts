import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { FileObjectEntity } from "../../../platform/files";
import { ExpCategoryEntity } from "./exp-category.entity";
import { ExpClaimEntity } from "./exp-claim.entity";

/**
 * Maps to `exp_claim_line` (docs/phase-4/04-schema-operations.md §4, the
 * DDL's inline "lines child" shorthand for `exp_claim`) — one expense item
 * within a staff claim. Module 14 (Expenses) **foundation pass only**.
 *
 * Columns designed per the task brief's own instruction ("design its
 * columns sensibly per the pattern of every other line table in this
 * codebase"): `claim_id` (FK, `ON DELETE CASCADE` — a line cannot outlive
 * its claim, same as every other `*_line` table's parent FK), `line_no`,
 * `category_id` (FK to `exp_category`, `RESTRICT` — BR-EXP-01: every
 * expense, including each claim line, maps to a category with a GL
 * account), `description varchar(200)`, `amount NUMERIC(18,4) > 0`,
 * `expense_date date`, `receipt_file_id` (nullable FK to `file_object`,
 * `RESTRICT`).
 *
 * **Base-class judgement call**: `MutableBaseEntity` — a claim's lines are
 * freely added/edited/removed while the parent `exp_claim` sits in `DRAFT`
 * (the claimant assembling their expense list before submission), the exact
 * same genuine post-creation edit window `BillInvoiceLineEntity`'s own doc
 * comment identifies as the defining test (there: `concession_amount`
 * written after creation; here: the whole line is revisable pre-submission,
 * matching `ProcRequisitionLineEntity`'s "requisition lines freely edited
 * while `DRAFT`" shape even more directly than `BillInvoiceLineEntity`
 * does) — diverging from `InvTransferLineEntity`/`ProcQuotationLineEntity`'s
 * `BaseEntity` choice, whose parent documents have NO pre-issue `DRAFT`
 * status at all (a transfer/quotation line is captured atomically). Once
 * `exp_claim.status` leaves `DRAFT`, freezing individual claim lines is a
 * SERVICE-layer concern for the next pass (no DB trigger names
 * `exp_claim_line` — only the parent `exp_claim`'s status is frozen by
 * `trg_exp_claim_immutable`, mirroring `trg_bill_invoice_immutable`'s own
 * "only the parent header is DB-frozen" scope).
 */
@Entity("exp_claim_line")
@Check("ck_exp_claim_line_amount_positive", `"amount" > 0`)
export class ExpClaimLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "claim_id" })
  claimId!: string;

  @ManyToOne(() => ExpClaimEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "claim_id" })
  claim?: ExpClaimEntity;

  @Column({ type: "int", name: "line_no" })
  lineNo!: number;

  @Column({ type: "uuid", name: "category_id" })
  categoryId!: string;

  @ManyToOne(() => ExpCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: ExpCategoryEntity;

  @Column({ type: "varchar", length: 200, name: "description" })
  description!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "date", name: "expense_date" })
  expenseDate!: string;

  @Column({ type: "uuid", name: "receipt_file_id", nullable: true })
  receiptFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "receipt_file_id" })
  receiptFile?: FileObjectEntity | null;
}
