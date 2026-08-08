/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 20
 * (Backups/Ops).
 */
export { BackupsOpsModule } from "./backups-ops.module";

export { BackupOrchestratorService } from "./application/backup-orchestrator.service";
export type { PruneResult } from "./application/backup-orchestrator.service";
export { RestoreVerificationService, compareRowCounts } from "./application/restore-verification.service";
export type { RowCountComparisonResult } from "./application/restore-verification.service";
export { OpsHealthService } from "./application/ops-health.service";
export type { OpsHealthSummary } from "./application/ops-health.service";

export {
  BkpBackupRunEntity,
  BKP_BACKUP_RUN_KINDS,
  BKP_BACKUP_RUN_STATUSES,
} from "./domain/bkp-backup-run.entity";
export type { BkpBackupRunKind, BkpBackupRunStatus, BackupDestinationResult, BackupManifest } from "./domain/bkp-backup-run.entity";
export { BkpRestoreRunEntity, BKP_RESTORE_RUN_STATUSES } from "./domain/bkp-restore-run.entity";
export type { BkpRestoreRunStatus } from "./domain/bkp-restore-run.entity";

export { BkpBackupRunRepository } from "./infrastructure/bkp-backup-run.repository";
export type { ListBackupRunsOptions } from "./infrastructure/bkp-backup-run.repository";
export { BkpRestoreRunRepository } from "./infrastructure/bkp-restore-run.repository";
export type { PgConnectionConfig } from "./infrastructure/backup-executor";
export { BackupToolNotFoundError, BackupExecutionError } from "./infrastructure/backup-executor";
