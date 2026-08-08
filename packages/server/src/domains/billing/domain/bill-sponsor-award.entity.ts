import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { SetTermEntity } from "../../../platform/settings";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillSponsorEntity } from "./bill-sponsor.entity";

/**
 * Maps to `bill_sponsor_award` (docs/phase-4/03-schema-student-finance.md §3)
 * — one sponsor's committed award amount for one student in one term.
 * `MutableBaseEntity` — a real post-creation update path: `applied_amount`
 * is incremented every time the next pass's sponsor-allocation service
 * applies part of this award against an invoice (BR-BILL-13, capped at the
 * award's own `amount` via `CHECK`), long after the row is first created.
 */
@Entity("bill_sponsor_award")
@Check("ck_bill_sponsor_award_amount_positive", `"amount" > 0`)
@Check("ck_bill_sponsor_award_applied_le_amount", `"applied_amount" <= "amount"`)
export class BillSponsorAwardEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "sponsor_id" })
  sponsorId!: string;

  @ManyToOne(() => BillSponsorEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sponsor_id" })
  sponsor?: BillSponsorEntity;

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

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "uuid", name: "category_scope", array: true, nullable: true })
  categoryScope!: string[] | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "applied_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  appliedAmount!: Money;
}
