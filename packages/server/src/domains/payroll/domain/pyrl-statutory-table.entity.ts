import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type PyrlStatutoryKind = "PAYE" | "NSSF" | "SHIF" | "AHL";
export const PYRL_STATUTORY_KINDS: readonly PyrlStatutoryKind[] = ["PAYE", "NSSF", "SHIF", "AHL"];

/**
 * Maps to `pyrl_statutory_table` (docs/phase-4/04-schema-operations.md §4)
 * — admin-editable Kenyan statutory rate/band tables (FR-PYRL-003: "All
 * rates/bands/relief flags live in `StatutoryRateTable` rows... never
 * hardcoded"). Module 15 (Payroll) **foundation pass only**
 * (docs/phase-5/PROGRESS.md) — the REAL rate seed data (PAYE bands, NSSF
 * tiers, SHIF rate, AHL rate) is deliberately deferred to a later pass
 * (task brief: "genuinely important and belongs in a later pass where it
 * can be verified/documented carefully, not rushed").
 *
 * `MutableBaseEntity` — admin-editable per FR-PYRL-003; even though rows
 * are effective-dated and mostly append-only, a `source_note`/`params`
 * correction before a row's own `effective_from` takes effect is a
 * plausible real edit, so this stays mutable rather than a pure append log.
 *
 * **BR-PYRL-01**: "Statutory computations always use the rate table
 * effective on the payroll period's end date. Missing table for a period
 * blocks the run with a named error." — the exact lookup is
 * `PyrlStatutoryTableRepository.findEffectiveFor(kind, periodEndDate)`:
 * latest `effective_from <= periodEndDate` for that `kind`.
 *
 * `params` is opaque jsonb — its shape (PAYE band boundaries + rates +
 * personal relief, NSSF tier 1/2 caps + rates, SHIF flat rate, AHL flat
 * rate) is the next pass's statutory-computation-engine's concern, not
 * encoded here.
 */
@Entity("pyrl_statutory_table")
@Index("uq_pyrl_statutory_table_kind_effective_from", ["kind", "effectiveFrom"], { unique: true })
@Check("ck_pyrl_statutory_table_kind", `"kind" IN ('PAYE','NSSF','SHIF','AHL')`)
export class PyrlStatutoryTableEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 6, name: "kind" })
  kind!: PyrlStatutoryKind;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: string;

  /** Opaque jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "params" })
  params!: Record<string, unknown>;

  @Column({ type: "text", name: "source_note" })
  sourceNote!: string;
}
