import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlEmployeeEntity } from "./pyrl-employee.entity";
import { PyrlComponentEntity } from "./pyrl-component.entity";

export type PyrlOneoffKind = "EARNING" | "DEDUCTION";
export const PYRL_ONEOFF_KINDS: readonly PyrlOneoffKind[] = ["EARNING", "DEDUCTION"];

/**
 * Maps to `pyrl_oneoff` (docs/phase-4/04-schema-operations.md §4) — a
 * one-off earning/deduction for a specific employee and period (e.g. a
 * bonus, a one-time deduction), consumed by exactly one `pyrl_run`'s
 * computation for that `period_key`. Module 15 (Payroll) **foundation pass
 * only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — genuinely editable until consumed by a run
 * (amount/reason corrections pre-computation), the same "editable until
 * consumed" shape the task brief names.
 *
 * `employee_id`/`component_id` are RESTRICT (referenced catalogue/master
 * data). `approval_ref` stays a loose `uuid` with no FK — same judgement
 * call as `PyrlLoanEntity.approvalRef` (see that entity's doc comment).
 *
 * `uq(employee_id, period_key, component_id)` — at most one one-off row per
 * employee/period/component combination (the DDL's own uniqueness rule).
 */
@Entity("pyrl_oneoff")
@Index("uq_pyrl_oneoff_employee_period_component", ["employeeId", "periodKey", "componentId"], {
  unique: true,
})
@Check("ck_pyrl_oneoff_kind", `"kind" IN ('EARNING','DEDUCTION')`)
export class PyrlOneoffEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "employee_id" })
  employeeId!: string;

  @ManyToOne(() => PyrlEmployeeEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employee_id" })
  employee?: PyrlEmployeeEntity;

  @Column({ type: "varchar", length: 7, name: "period_key" })
  periodKey!: string;

  @Column({ type: "varchar", length: 10, name: "kind" })
  kind!: PyrlOneoffKind;

  @Column({ type: "uuid", name: "component_id" })
  componentId!: string;

  @ManyToOne(() => PyrlComponentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "component_id" })
  component?: PyrlComponentEntity;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "amount", transformer: RequiredMoneyTransformer })
  amount!: Money;

  @Column({ type: "text", name: "reason" })
  reason!: string;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;
}
