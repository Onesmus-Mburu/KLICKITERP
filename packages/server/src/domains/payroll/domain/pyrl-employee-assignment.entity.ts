import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlEmployeeEntity } from "./pyrl-employee.entity";
import { PyrlSalaryStructureEntity } from "./pyrl-salary-structure.entity";

/**
 * Maps to `pyrl_employee_assignment` (docs/phase-4/04-schema-operations.md
 * §4) — assigns an employee onto a `pyrl_salary_structure` for an
 * effective-dated period, with a snapshot `basic_pay`. Module 15 (Payroll)
 * **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — the DDL's own no-overlap invariant genuinely means
 * `effective_to` gets closed out IN PLACE (an `UPDATE`) on the row that was
 * previously open-ended the moment a new assignment starts, the exact
 * `MutableBaseEntity` justification the task brief names.
 *
 * **No-overlap `EXCLUDE USING gist` constraint** — TypeORM's decorators
 * cannot express a GiST exclusion constraint, so this is raw SQL in
 * migration `0130` (`excl_pyrl_employee_assignment_no_overlap`):
 * `EXCLUDE USING gist (employee_id WITH =, daterange(effective_from,
 * effective_to, '[]') WITH &&)` — an employee can hold only ONE active
 * salary-structure assignment at any given date; a second, overlapping
 * assignment row is rejected at the DB layer (BR-PYRL-adjacent invariant,
 * not itself a numbered BR-PYRL rule, but the schema's own stated intent).
 * Requires the `btree_gist` extension, enabled by migration `0125`
 * (`EnableBtreeGist0125`), run BEFORE `0130`. `'[]'` (both bounds inclusive)
 * is a documented judgement call — `effective_to` is read as the LAST
 * active calendar day (inclusive), not an exclusive boundary, matching how
 * HR/payroll effective-dating is conventionally described in prose ("valid
 * from 1 Jan to 30 Jun"). `effective_to IS NULL` means open-ended/ongoing;
 * `daterange()`'s own NULL-as-unbounded handling makes this fall out
 * naturally, no special-casing needed.
 */
@Entity("pyrl_employee_assignment")
@Check(
  "ck_pyrl_employee_assignment_dates",
  `"effective_to" IS NULL OR "effective_to" >= "effective_from"`,
)
export class PyrlEmployeeAssignmentEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "employee_id" })
  employeeId!: string;

  @ManyToOne(() => PyrlEmployeeEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employee_id" })
  employee?: PyrlEmployeeEntity;

  @Column({ type: "uuid", name: "structure_id" })
  structureId!: string;

  @ManyToOne(() => PyrlSalaryStructureEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "structure_id" })
  structure?: PyrlSalaryStructureEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "basic_pay",
    transformer: RequiredMoneyTransformer,
  })
  basicPay!: Money;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: string;

  @Column({ type: "date", name: "effective_to", nullable: true })
  effectiveTo!: string | null;
}
