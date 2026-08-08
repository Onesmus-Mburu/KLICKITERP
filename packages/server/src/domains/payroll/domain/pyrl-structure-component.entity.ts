import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlSalaryStructureEntity } from "./pyrl-salary-structure.entity";
import { PyrlComponentEntity } from "./pyrl-component.entity";

/**
 * Maps to `pyrl_structure_component` (docs/phase-4/04-schema-operations.md
 * §4) — one earning/deduction line attached to a `pyrl_salary_structure`,
 * either a flat `amount` OR a `formula` jsonb (e.g. "12% of basic") — the
 * DDL's own `amount|formula jsonb`. Module 15 (Payroll) **foundation pass
 * only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — a real post-creation edit window: lines are freely
 * edited while the structure isn't yet actively assigned to employees, the
 * same "freely edited pre-use" shape `bill_invoice_line`/
 * `ProcRequisitionLineEntity` established.
 *
 * `structure_id` -> `pyrl_salary_structure` is CASCADE (a true owned child —
 * deleting the structure deletes its lines). `component_id` ->
 * `pyrl_component` is RESTRICT (a shared catalogue entry, referenced by
 * many structures, must not be deleted out from under one).
 *
 * `formula` is opaque jsonb — its shape (percentage-of-basic, tiered bands,
 * etc.) is a service-layer concern for the statutory/computation-engine
 * pass, not encoded here.
 */
@Entity("pyrl_structure_component")
@Check(
  "ck_pyrl_structure_component_amount_or_formula",
  `"amount" IS NOT NULL OR "formula" IS NOT NULL`,
)
export class PyrlStructureComponentEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "structure_id" })
  structureId!: string;

  @ManyToOne(() => PyrlSalaryStructureEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "structure_id" })
  structure?: PyrlSalaryStructureEntity;

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
    nullable: true,
    transformer: MoneyTransformer,
  })
  amount!: Money | null;

  /** Opaque jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "formula", nullable: true })
  formula!: Record<string, unknown> | null;
}
