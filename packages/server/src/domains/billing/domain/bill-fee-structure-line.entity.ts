import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Barrel import — safe here (application/entity import convention, not the
// entity-decorator-cycle exception `bill-fee-structure.entity.ts` documents
// for `domains/students`' entities): `platform/settings` has no reverse
// dependency back onto `domains/billing`, so no circular-require risk exists.
import { SetTermEntity } from "../../../platform/settings";
import { BillFeeCategoryEntity } from "./bill-fee-category.entity";
import { BillFeeStructureEntity } from "./bill-fee-structure.entity";

/**
 * Maps to `bill_fee_structure_line` (docs/phase-4/03-schema-student-finance.md
 * §3) — one category/amount row of a `bill_fee_structure`. `MutableBaseEntity`
 * — a documented judgement call: lines are freely edited while the parent
 * structure sits in `DRAFT` (the same "config row edited pre-activation"
 * shape as `gl_budget_line`/`appr_level`), which is exactly why
 * `trg_bill_structure_immutable` (migration `0070`) is a *conditional*
 * `BEFORE UPDATE OR DELETE` trigger — checking the parent's `status` at
 * write time — rather than an unconditional block like
 * `trg_gl_journal_immutable`; an unconditional-immutable table would need no
 * such condition. Once the parent flips to `PUBLISHED` (BR-BILL-03), the
 * trigger rejects every further UPDATE/DELETE — changes must create a new
 * structure version instead.
 *
 * **Phase 6 Slice 3b (2026-07-29, migration `0210`)**: `termId`/`dueDate`
 * added here — the parent `BillFeeStructureEntity` now spans a whole
 * academic year, so each LINE carries its own term (which must belong to
 * the parent structure's own `academicYearId` — enforced in
 * `FeeStructuresService.addLine()`, not at this layer) and due date. The
 * structure+category uniqueness widened from `(feeStructureId,
 * feeCategoryId)` to `(feeStructureId, feeCategoryId, termId)` — a structure
 * may now legitimately have two lines for the same category, priced
 * differently in two different terms.
 */
@Entity("bill_fee_structure_line")
@Index("uq_bill_fee_structure_line_structure_category", ["feeStructureId", "feeCategoryId", "termId"], {
  unique: true,
})
@Check("ck_bill_fee_structure_line_amount_nonneg", `"amount" >= 0`)
export class BillFeeStructureLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "fee_structure_id" })
  feeStructureId!: string;

  @ManyToOne(() => BillFeeStructureEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "fee_structure_id" })
  feeStructure?: BillFeeStructureEntity;

  @Column({ type: "uuid", name: "fee_category_id" })
  feeCategoryId!: string;

  @ManyToOne(() => BillFeeCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_category_id" })
  feeCategory?: BillFeeCategoryEntity;

  @Column({ type: "uuid", name: "term_id" })
  termId!: string;

  @ManyToOne(() => SetTermEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "term_id" })
  term?: SetTermEntity;

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

  @Column({ type: "boolean", name: "is_optional", default: false })
  isOptional!: boolean;
}
