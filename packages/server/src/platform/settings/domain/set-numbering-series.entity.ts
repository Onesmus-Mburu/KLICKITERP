import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type SetNumberingResetPolicy = "NEVER" | "YEARLY" | "TERMLY";

/**
 * Sentinel `period_key` for `reset_policy='NEVER'` rows. Kept as a constant
 * non-null string rather than `NULL` so
 * `uq_set_numbering_series_doc_type_series_code_period_key` is a real
 * uniqueness guarantee: standard SQL treats `NULL <> NULL` under a plain
 * UNIQUE constraint, so a nullable `period_key` would let two concurrent
 * "first ever `allocate()` for this doc_type" transactions both insert a
 * NEVER-policy row for the same `(doc_type, series_code)`. See
 * `NumberingService.allocate()`, which relies on this constraint for its
 * `INSERT ... ON CONFLICT DO NOTHING` upsert-on-first-use race handling.
 */
export const NUMBERING_SERIES_NEVER_PERIOD_KEY = "NONE";

/**
 * Maps to `set_numbering_series` (docs/phase-4/02-schema-platform-accounting.md
 * §4) — THE gapless document-numbering allocator's backing table
 * (NFR-INT-003). `nextNo` is `bigint`, represented as `string` in TypeScript
 * (matches this codebase's convention for bigint columns — see
 * `OutboxEntity.seq`/`AuditLogEntity.seq`) since JS `number` cannot safely
 * hold the full 64-bit range.
 */
@Entity("set_numbering_series")
@Index("uq_set_numbering_series_doc_type_series_code_period_key", ["docType", "seriesCode", "periodKey"], {
  unique: true,
})
@Check("ck_set_numbering_series_reset_policy", `"reset_policy" IN ('NEVER','YEARLY','TERMLY')`)
@Check("ck_set_numbering_series_next_no", `"next_no" > 0`)
export class SetNumberingSeriesEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "doc_type" })
  docType!: string;

  @Column({ type: "varchar", length: 10, name: "series_code", default: "MAIN" })
  seriesCode!: string;

  @Column({ type: "varchar", length: 12, name: "prefix" })
  prefix!: string;

  @Column({ type: "int", name: "pad_width" })
  padWidth!: number;

  @Column({ type: "varchar", length: 10, name: "reset_policy" })
  resetPolicy!: SetNumberingResetPolicy;

  @Column({ type: "varchar", length: 12, name: "period_key" })
  periodKey!: string;

  @Column({ type: "bigint", name: "next_no" })
  nextNo!: string;
}
