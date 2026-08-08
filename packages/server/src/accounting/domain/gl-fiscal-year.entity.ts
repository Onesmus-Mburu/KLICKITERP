import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

export type GlFiscalYearStatus = "OPEN" | "CLOSING" | "LOCKED";
export const GL_FISCAL_YEAR_STATUSES: readonly GlFiscalYearStatus[] = ["OPEN", "CLOSING", "LOCKED"];

/**
 * Maps to `gl_fiscal_year` (docs/phase-4/02-schema-platform-accounting.md
 * §8). `MutableBaseEntity` — ordinary mutable config, edited by a future
 * `PostingService`/period-close workflow (next pass) as the year progresses
 * through `OPEN -> CLOSING -> LOCKED`.
 */
@Entity("gl_fiscal_year")
@Index("uq_gl_fiscal_year_name", ["name"], { unique: true })
@Check("ck_gl_fiscal_year_status", `"status" IN ('OPEN','CLOSING','LOCKED')`)
export class GlFiscalYearEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "name" })
  name!: string;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: GlFiscalYearStatus;
}
