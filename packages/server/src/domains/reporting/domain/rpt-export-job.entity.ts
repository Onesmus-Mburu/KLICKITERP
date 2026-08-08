import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";
import { FileObjectEntity } from "../../../platform/files";

export type RptExportJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
export const RPT_EXPORT_JOB_STATUSES: readonly RptExportJobStatus[] = ["QUEUED", "RUNNING", "DONE", "FAILED"];

/**
 * Maps to `rpt_export_job` (docs/phase-4/04-schema-operations.md §6) — a
 * background export request (FR-RPT-005.1: any report estimated at >10k rows
 * or >10s generation time is queued here rather than generated inline).
 * Module 18 **foundation pass only** — the actual worker that picks up
 * `QUEUED` rows, generates the file, and writes it to `file_object` via
 * `platform/files` is a later pass's concern.
 *
 * `MutableBaseEntity` — `status` progresses `QUEUED -> RUNNING ->
 * DONE|FAILED` in place, and `file_id`/`expires_at` are filled in once the
 * job completes — genuine ongoing post-creation edits, same shape
 * `bank_statement_import`/`fa_depreciation_run`'s own job/run-style rows
 * establish elsewhere in this codebase (though unlike those two, no
 * immutability trigger is added here — a documented judgement call: an
 * export job has no downstream financial postings hanging off it the way a
 * depreciation run does, so there is nothing that needs freezing once
 * `DONE`, only the ordinary "don't let a completed job silently un-complete"
 * discipline the next pass's worker service will need to hold itself to).
 *
 * `report_code`/`params` mirror `rpt_saved_params`/`rpt_schedule`'s own
 * identical columns — same conventions (bare `varchar(40)`, no FK/CHECK for
 * `report_code`; opaque `jsonb` for `params`). `requested_by` -> `usr_user`
 * (`platform/users`, `RESTRICT`) is who asked for the export (either
 * directly, or the schedule owner when a `rpt_schedule` fires one — this
 * table carries no FK back to `rpt_schedule` itself, since the DDL names
 * none; a scheduled run's originating schedule, if ever needed, would live
 * in `params` or be inferred by matching `report_code`/timing).
 *
 * `file_id` -> `file_object` (`platform/files`, nullable, `ON DELETE SET
 * NULL`) — same convention `PyrlRunLineEntity.payslipFileId`/
 * `ProcQuotationEntity.documentFileId` establish for a generated,
 * potentially-cleaned-up attachment: a deleted/expired export file shouldn't
 * block deleting the underlying `file_object` row, and the job's own history
 * (`status`/`params`/timestamps) should survive that cleanup.
 *
 * `ix_rpt_export_job_status_p` (partial index on the still-actionable
 * `QUEUED`/`RUNNING` subset) is the forward-looking index the next pass's
 * worker poll query needs — same "partial index for the live/actionable
 * subset" convention `comm_message`'s own `ix_comm_message_status_p` /
 * `rpt_schedule`'s own `ix_rpt_schedule_active_p` establish.
 */
@Entity("rpt_export_job")
@Index("ix_rpt_export_job_status_p", ["status"], { where: `"status" IN ('QUEUED','RUNNING')` })
@Index("ix_rpt_export_job_requested_by", ["requestedBy"])
@Check("ck_rpt_export_job_status", `"status" IN ('QUEUED','RUNNING','DONE','FAILED')`)
export class RptExportJobEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 40, name: "report_code" })
  reportCode!: string;

  /** Opaque, report-specific filter/parameter shape — see `RptSavedParamsEntity`'s doc comment for the same convention. */
  @Column({ type: "jsonb", name: "params" })
  params!: Record<string, unknown>;

  @Column({ type: "uuid", name: "requested_by" })
  requestedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "requested_by" })
  requester?: UsrUserEntity;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: RptExportJobStatus;

  @Column({ type: "uuid", name: "file_id", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "file_id" })
  file?: FileObjectEntity | null;

  @Column({ type: "timestamptz", name: "expires_at", nullable: true })
  expiresAt!: Date | null;
}
