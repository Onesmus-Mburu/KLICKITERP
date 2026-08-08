import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlRunLineEntity } from "./pyrl-run-line.entity";
import { PyrlComponentEntity } from "./pyrl-component.entity";

/**
 * Maps to `pyrl_run_line_component` (docs/phase-4/04-schema-operations.md
 * §4) — the full earning/deduction breakdown backing a `pyrl_run_line`'s
 * aggregate totals. Module 15 (Payroll) **foundation pass only**
 * (docs/phase-5/PROGRESS.md).
 *
 * **`BaseEntity`** — same reasoning as `PyrlRunLineEntity` (its own
 * immediate parent): computed wholesale by the computation engine, frozen
 * by `trg_pyrl_run_line_immutable` once the grandparent `pyrl_run` reaches
 * `COMMITTED`+ (that trigger is defined `BEFORE UPDATE ON pyrl_run_line`
 * only — this child table has no analogous trigger of its own since these
 * rows are never updated in place post-creation, only inserted once
 * alongside their parent line; deleting/recreating a `DRAFT`/`COMPUTED`
 * run's lines wholesale, which CASCADE from `pyrl_run_line`'s own CASCADE
 * off `pyrl_run`, is the next pass's recompute mechanism).
 *
 * `run_line_id` -> `pyrl_run_line` is CASCADE (owned child).
 * `component_id` -> `pyrl_component` is RESTRICT (shared catalogue entry).
 */
@Entity("pyrl_run_line_component")
export class PyrlRunLineComponentEntity extends BaseEntity {
  @Column({ type: "uuid", name: "run_line_id" })
  runLineId!: string;

  @ManyToOne(() => PyrlRunLineEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_line_id" })
  runLine?: PyrlRunLineEntity;

  @Column({ type: "uuid", name: "component_id" })
  componentId!: string;

  @ManyToOne(() => PyrlComponentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "component_id" })
  component?: PyrlComponentEntity;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "amount", transformer: RequiredMoneyTransformer })
  amount!: Money;
}
