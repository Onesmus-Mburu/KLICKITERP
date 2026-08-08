import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { SetTermEntity } from "../../../platform/settings";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillFeeCategoryEntity } from "./bill-fee-category.entity";

/**
 * Maps to `bill_student_optional_item` (docs/phase-4/03-schema-student-finance.md
 * §3) — a per-student, per-term opt-in to an optional fee-structure line
 * (`bill_fee_structure_line.is_optional = true`), FR-BILL-013. `MutableBaseEntity`
 * — `amount_override` (and the row's continued existence) can be revised
 * while a term's invoices haven't yet been generated for this student, a
 * real post-creation update path.
 */
@Entity("bill_student_optional_item")
@Index("uq_bill_student_optional_item_student_term_category", ["studentId", "termId", "feeCategoryId"], {
  unique: true,
})
export class BillStudentOptionalItemEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "uuid", name: "term_id" })
  termId!: string;

  @ManyToOne(() => SetTermEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "term_id" })
  term?: SetTermEntity;

  @Column({ type: "uuid", name: "fee_category_id" })
  feeCategoryId!: string;

  @ManyToOne(() => BillFeeCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_category_id" })
  feeCategory?: BillFeeCategoryEntity;

  /** NULL means "use the structure line's own amount unchanged". */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount_override",
    nullable: true,
    transformer: MoneyTransformer,
  })
  amountOverride!: Money | null;
}
