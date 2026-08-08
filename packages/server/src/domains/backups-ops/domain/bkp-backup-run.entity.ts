import { Check, Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type BkpBackupRunKind = "SCHEDULED" | "MANUAL" | "PRE_UPDATE";
export const BKP_BACKUP_RUN_KINDS: readonly BkpBackupRunKind[] = ["SCHEDULED", "MANUAL", "PRE_UPDATE"];

export type BkpBackupRunStatus = "RUNNING" | "OK" | "FAILED";
export const BKP_BACKUP_RUN_STATUSES: readonly BkpBackupRunStatus[] = ["RUNNING", "OK", "FAILED"];

export type BackupDestinationType = "LOCAL" | "MINIO" | "OFFSITE_S3";

/**
 * One fan-out attempt record inside `bkp_backup_run.destinations` (jsonb
 * array) — docs/phase-3/03-deployment-infrastructure.md §6's "fan out to
 * local volume (7 daily) / MinIO bucket (4 weekly) / optional offsite S3 (12
 * monthly)". `path`/`bucket`+`key` are populated per `type` (LOCAL uses
 * `path`, MINIO/OFFSITE_S3 use `bucket`+`key`) — `BackupOrchestratorService`
 * reads these back for `pruneOldBackups()`'s destination cleanup and
 * `RestoreVerificationService`'s `materializeBackupFile()` fetch-back.
 */
export interface BackupDestinationResult {
  type: BackupDestinationType;
  path?: string;
  bucket?: string;
  key?: string;
  ok: boolean;
  error?: string;
}

/**
 * `bkp_backup_run.manifest` (jsonb) — the "SHA-256 manifest" step in
 * docs/phase-3/03-deployment-infrastructure.md §6's flow diagram. `sha256`/
 * `sizeBytes` describe the FINAL AES-256-GCM-encrypted archive (what's
 * actually stored at each destination and what a downloaded backup's
 * integrity is checked against) — `dbDumpSizeBytes`/`filesTarSizeBytes` are
 * the two pre-encryption component sizes, kept for diagnostics.
 * `tableRowCounts` is the representative-sample row-count snapshot
 * `RestoreVerificationService.verifyBackup()` later compares against a
 * restored target (FR-BKP-003.1's "row counts vs manifest" smoke query).
 * `passphraseCheck` is the "key-check block" FR-BKP-001.1 calls for — a
 * small AES-256-GCM-encrypted known plaintext (`backup-encryption.util.ts`'s
 * `BACKUP_PASSPHRASE_CHECK_PLAINTEXT`) so a wrong `BACKUP_PASSPHRASE` at
 * restore time fails fast with a clear message instead of a confusing
 * mid-decrypt auth-tag error.
 */
export interface BackupManifest {
  sha256: string;
  sizeBytes: number;
  dbDumpSizeBytes: number;
  filesTarSizeBytes: number;
  createdAt: string;
  kind: BkpBackupRunKind;
  tableRowCounts: Record<string, number>;
  passphraseCheck: string;
}

/**
 * Maps to `bkp_backup_run` (docs/phase-4/04-schema-operations.md §6) —
 * Module 20 (Backups/Ops). `MutableBaseEntity` (not `BaseEntity`) because a
 * run row genuinely progresses in place: created `status='RUNNING'`, then
 * `BackupOrchestratorService.runBackup()`'s try/catch ALWAYS finalizes it to
 * `'OK'` or `'FAILED'` before returning — never left stuck `RUNNING`, even
 * when the flow throws mid-way (pg_dump missing, MinIO unreachable, etc.).
 */
@Entity("bkp_backup_run")
@Check("ck_bkp_backup_run_kind", `"kind" IN ('SCHEDULED','MANUAL','PRE_UPDATE')`)
@Check("ck_bkp_backup_run_status", `"status" IN ('RUNNING','OK','FAILED')`)
export class BkpBackupRunEntity extends MutableBaseEntity {
  @Column({ type: "timestamptz", name: "started_at" })
  startedAt!: Date;

  @Column({ type: "timestamptz", name: "finished_at", nullable: true })
  finishedAt!: Date | null;

  @Column({ type: "varchar", length: 12, name: "kind" })
  kind!: BkpBackupRunKind;

  @Column({ type: "varchar", length: 10, name: "status", default: "RUNNING" })
  status!: BkpBackupRunStatus;

  /** `bigint` represented as `string` (JS `number` can't safely hold the full 64-bit range) — same convention as `FileObjectEntity.sizeBytes`. */
  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes!: string | null;

  @Column({ type: "varchar", length: 64, name: "sha256", nullable: true })
  sha256!: string | null;

  @Column({ type: "jsonb", name: "destinations", default: () => "'[]'" })
  destinations!: BackupDestinationResult[];

  @Column({ type: "jsonb", name: "manifest", nullable: true })
  manifest!: BackupManifest | null;

  @Column({ type: "text", name: "error", nullable: true })
  error!: string | null;
}
