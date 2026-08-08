import { Check, Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { BackupManifest } from "./bkp-backup-run.entity";

/**
 * `docs/phase-4/04-schema-operations.md §6`'s DDL for `bkp_restore_run`
 * leaves `status` un-enumerated ("PK, from_manifest jsonb, started_at,
 * finished_at, status, notes text") — this module's own design decision,
 * per the task brief's explicit instruction: mirror `bkp_backup_run.status`'s
 * shape exactly (`RUNNING|OK|FAILED`) rather than inventing a distinct set,
 * since a restore-verification run has the exact same lifecycle shape
 * (started RUNNING, finalized OK/FAILED, never left stuck).
 */
export type BkpRestoreRunStatus = "RUNNING" | "OK" | "FAILED";
export const BKP_RESTORE_RUN_STATUSES: readonly BkpRestoreRunStatus[] = ["RUNNING", "OK", "FAILED"];

/**
 * Maps to `bkp_restore_run` (docs/phase-4/04-schema-operations.md §6) —
 * Module 20 (Backups/Ops), FR-BKP-003.1's weekly restore-verify record.
 * `fromManifest` is a full copy of the `bkp_backup_run.manifest` this
 * restore-verification ran against (kept denormalized on this row so a
 * restore run's provenance survives even if the source `bkp_backup_run` is
 * later pruned by `pruneOldBackups()`'s GFS rotation). `MutableBaseEntity`
 * for the same "genuinely progresses RUNNING -> OK/FAILED, never stuck"
 * reason `BkpBackupRunEntity` documents.
 *
 * **Scope boundary** (see `RestoreVerificationService`'s own doc comment):
 * this entity/row only records the OUTCOME of a restore-verify run against
 * an already-reachable target connection — provisioning the "scratch
 * container" target itself is explicitly out of this module's scope
 * (ops-tooling/deployment concern, Phase 8 territory per the architecture
 * doc).
 */
@Entity("bkp_restore_run")
@Check("ck_bkp_restore_run_status", `"status" IN ('RUNNING','OK','FAILED')`)
export class BkpRestoreRunEntity extends MutableBaseEntity {
  @Column({ type: "jsonb", name: "from_manifest" })
  fromManifest!: BackupManifest;

  @Column({ type: "timestamptz", name: "started_at" })
  startedAt!: Date;

  @Column({ type: "timestamptz", name: "finished_at", nullable: true })
  finishedAt!: Date | null;

  @Column({ type: "varchar", length: 10, name: "status", default: "RUNNING" })
  status!: BkpRestoreRunStatus;

  @Column({ type: "text", name: "notes", nullable: true })
  notes!: string | null;
}
