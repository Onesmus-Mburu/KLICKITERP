import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";
import { GlFiscalYearEntity } from "./gl-fiscal-year.entity";

export type GlPeriodStatus = "OPEN" | "SOFT_CLOSED" | "HARD_CLOSED";
export const GL_PERIOD_STATUSES: readonly GlPeriodStatus[] = ["OPEN", "SOFT_CLOSED", "HARD_CLOSED"];

/**
 * Maps to `gl_period` (docs/phase-4/02-schema-platform-accounting.md §8).
 * `MutableBaseEntity` — the period-close workflow (next pass) flips
 * `status` `OPEN -> SOFT_CLOSED -> HARD_CLOSED`. `trg_gl_period_open`
 * (migration `0060`) rejects any `gl_journal` INSERT that references a
 * `HARD_CLOSED` period (BR-GEN-04) — enforced at the DB layer, not here.
 */
@Entity("gl_period")
@Index("uq_gl_period_fiscal_year_id_seq", ["fiscalYearId", "seq"], { unique: true })
@Index("ix_gl_period_dates", ["startsOn", "endsOn"])
@Check("ck_gl_period_status", `"status" IN ('OPEN','SOFT_CLOSED','HARD_CLOSED')`)
export class GlPeriodEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "fiscal_year_id" })
  fiscalYearId!: string;

  @ManyToOne(() => GlFiscalYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fiscal_year_id" })
  fiscalYear?: GlFiscalYearEntity;

  @Column({ type: "int", name: "seq" })
  seq!: number;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: GlPeriodStatus;
}
