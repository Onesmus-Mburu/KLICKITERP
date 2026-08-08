import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `pyrl_salary_structure` (docs/phase-4/04-schema-operations.md §4)
 * — a named pay grade/structure template (e.g. "Teaching Grade 3") that
 * `pyrl_structure_component` rows attach earning/deduction lines to and
 * `pyrl_employee_assignment` rows assign employees onto. Module 15
 * (Payroll) **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — genuine post-creation editing: `grade`/
 * `effective_from` corrections while the structure isn't yet (or is no
 * longer) actively assigned.
 */
@Entity("pyrl_salary_structure")
@Index("uq_pyrl_salary_structure_name", ["name"], { unique: true })
export class PyrlSalaryStructureEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 30, name: "grade", nullable: true })
  grade!: string | null;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: string;
}
