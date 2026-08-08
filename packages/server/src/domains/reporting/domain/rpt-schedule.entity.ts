import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";

export type RptScheduleFormat = "PDF" | "XLSX" | "CSV";
export const RPT_SCHEDULE_FORMATS: readonly RptScheduleFormat[] = ["PDF", "XLSX", "CSV"];

/**
 * Maps to `rpt_schedule` (docs/phase-4/04-schema-operations.md §6) — a
 * recurring report run (FR-RPT-007.1: cron + params + recipients + format).
 * Module 18 **foundation pass only** — the actual scheduler/dispatcher that
 * reads `cron`/`is_active` rows and fires exports on a timer is a later
 * pass's concern (no worker/job-runner exists anywhere in this codebase yet,
 * same "no dispatcher wired up" gap every other module's own outbox events
 * currently have).
 *
 * `MutableBaseEntity` — `is_active` is toggled (pause/resume), and
 * `last_run_at`/`last_ok` are updated in place after every run by the future
 * scheduler — genuine ongoing post-creation edits.
 *
 * `report_code` mirrors `rpt_saved_params.report_code` — same bare
 * `varchar(40)`, no FK/CHECK (no report catalogue table exists yet).
 * `params`/`recipients` are opaque `jsonb` (`recipients` is left
 * unstructured here — likely a list of user ids and/or raw email addresses,
 * decided by the next pass's scheduler/dispatch service, not this
 * foundation pass). `cron` is a raw cron-expression string, not validated at
 * this layer. `owner_user_id` -> `usr_user` (`platform/users`, `RESTRICT`) is
 * who the schedule runs on behalf of / who gets notified on failure.
 *
 * `ix_rpt_schedule_active_p` (partial index `WHERE is_active`) is the
 * forward-looking index the next pass's scheduler poll query needs (find
 * every active schedule due to run), the same "partial index for the
 * live/actionable subset" convention `comm_message`'s own
 * `ix_comm_message_status_p` established.
 */
@Entity("rpt_schedule")
@Index("ix_rpt_schedule_active_p", ["isActive"], { where: `"is_active" = true` })
@Index("ix_rpt_schedule_owner", ["ownerUserId"])
@Check("ck_rpt_schedule_format", `"format" IN ('PDF','XLSX','CSV')`)
export class RptScheduleEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 40, name: "report_code" })
  reportCode!: string;

  /** Opaque, report-specific filter/parameter shape — see `RptSavedParamsEntity`'s doc comment for the same convention. */
  @Column({ type: "jsonb", name: "params" })
  params!: Record<string, unknown>;

  @Column({ type: "varchar", length: 30, name: "cron" })
  cron!: string;

  /** Opaque jsonb — recipient user ids and/or raw email addresses, shape decided by the next pass's dispatch service. */
  @Column({ type: "jsonb", name: "recipients" })
  recipients!: unknown;

  @Column({ type: "varchar", length: 4, name: "format" })
  format!: RptScheduleFormat;

  @Column({ type: "uuid", name: "owner_user_id" })
  ownerUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "owner_user_id" })
  owner?: UsrUserEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "timestamptz", name: "last_run_at", nullable: true })
  lastRunAt!: Date | null;

  @Column({ type: "boolean", name: "last_ok", nullable: true })
  lastOk!: boolean | null;
}
