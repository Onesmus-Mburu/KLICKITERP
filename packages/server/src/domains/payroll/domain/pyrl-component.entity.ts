import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlAccountEntity } from "../../../accounting";

export type PyrlComponentKind = "EARNING" | "DEDUCTION";
export const PYRL_COMPONENT_KINDS: readonly PyrlComponentKind[] = ["EARNING", "DEDUCTION"];

/**
 * Maps to `pyrl_component` (docs/phase-4/04-schema-operations.md §4) — the
 * catalogue of payroll earning/deduction line types (basic pay, house
 * allowance, PAYE, NSSF, loan recovery, etc). Module 15 (Payroll)
 * **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — genuine post-creation editing: `is_taxable`/
 * `gl_account_id` corrections before a component is wired into structures.
 *
 * `gl_account_id` is required (no `NULL` marker in the DDL) — every
 * component must resolve to a real GL posting target once the next pass's
 * payroll-posting engine runs; RESTRICT so an in-use account can't be
 * deleted out from under it.
 */
@Entity("pyrl_component")
@Index("uq_pyrl_component_code", ["code"], { unique: true })
@Check("ck_pyrl_component_kind", `"kind" IN ('EARNING','DEDUCTION')`)
export class PyrlComponentEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 10, name: "kind" })
  kind!: PyrlComponentKind;

  @Column({ type: "boolean", name: "is_taxable" })
  isTaxable!: boolean;

  @Column({ type: "boolean", name: "is_statutory", default: false })
  isStatutory!: boolean;

  @Column({ type: "uuid", name: "gl_account_id" })
  glAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_account_id" })
  glAccount?: GlAccountEntity;
}
