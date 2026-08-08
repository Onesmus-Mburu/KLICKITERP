import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlEmployeeEntity } from "./pyrl-employee.entity";
import { PyrlComponentEntity } from "./pyrl-component.entity";

/**
 * Maps to `pyrl_employee_component` (docs/phase-4/04-schema-operations.md
 * §4) — an employee-specific override/addition of a component amount
 * (e.g. a personal allowance), effective-dated. Module 15 (Payroll)
 * **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — same closed-out-in-place `effective_to` shape
 * `PyrlEmployeeAssignmentEntity` documents.
 *
 * **No-overlap `EXCLUDE USING gist` constraint** — raw SQL in migration
 * `0130` (`excl_pyrl_employee_component_no_overlap`). The DDL's own comment
 * ("same EXCLUDE pattern") is read as "the same NO-OVERLAP MECHANISM", NOT
 * literally `employee_id`-only equality copy-pasted from
 * `pyrl_employee_assignment` — a documented judgement call: an
 * `employee_id`-only exclusion would forbid an employee from ever having
 * TWO DIFFERENT components active at the same time (e.g. a housing
 * allowance AND a transport allowance both running concurrently), which
 * defeats the table's own purpose. This constraint is instead scoped to
 * `(employee_id, component_id)`: `EXCLUDE USING gist (employee_id WITH =,
 * component_id WITH =, daterange(effective_from, effective_to, '[]') WITH
 * &&)` — an employee cannot have two overlapping date ranges for the SAME
 * component, but CAN hold multiple different components concurrently.
 * Requires `btree_gist` (migration `0125`, run before `0130`). Same `'[]'`
 * inclusive-bounds judgement call as `PyrlEmployeeAssignmentEntity`.
 */
@Entity("pyrl_employee_component")
@Check(
  "ck_pyrl_employee_component_dates",
  `"effective_to" IS NULL OR "effective_to" >= "effective_from"`,
)
export class PyrlEmployeeComponentEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "employee_id" })
  employeeId!: string;

  @ManyToOne(() => PyrlEmployeeEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employee_id" })
  employee?: PyrlEmployeeEntity;

  @Column({ type: "uuid", name: "component_id" })
  componentId!: string;

  @ManyToOne(() => PyrlComponentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "component_id" })
  component?: PyrlComponentEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: string;

  @Column({ type: "date", name: "effective_to", nullable: true })
  effectiveTo!: string | null;
}
