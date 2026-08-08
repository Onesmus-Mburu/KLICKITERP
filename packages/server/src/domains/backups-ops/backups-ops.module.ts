import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../platform/files";
import { SettingsModule } from "../../platform/settings";
import { BkpBackupRunEntity } from "./domain/bkp-backup-run.entity";
import { BkpRestoreRunEntity } from "./domain/bkp-restore-run.entity";
import { BkpBackupRunRepository } from "./infrastructure/bkp-backup-run.repository";
import { BkpRestoreRunRepository } from "./infrastructure/bkp-restore-run.repository";
import { BackupExecutorService } from "./infrastructure/backup-executor.service";
import { BackupStorageClient } from "./infrastructure/backup-storage-client";
import { OffsiteS3Adapter } from "./infrastructure/offsite-s3.adapter";
import { RowCountSamplerService } from "./infrastructure/row-count-sampler.service";
import { BackupOrchestratorService } from "./application/backup-orchestrator.service";
import { RestoreVerificationService } from "./application/restore-verification.service";
import { OpsHealthService } from "./application/ops-health.service";
import { BackupsController } from "./api/backups.controller";
import { OpsController } from "./api/ops.controller";

/**
 * Module 20 (Backups/Ops) — built in a single comprehensive pass (2 tables,
 * real mechanical substance: `pg_dump`/`pg_restore`/`tar` shell-outs,
 * AES-256-GCM archive encryption, GFS 7/4/12 retention math, MinIO/offsite-S3
 * fan-out, DB/Redis/MinIO health pings, disk usage). Imports `FilesModule`
 * (for the `STORAGE_PORT` cross-module grant — see `files.module.ts`'s own
 * doc comment on the new `exports` entry that makes this possible) and
 * `SettingsModule` (for `SettingsService`, backing `OffsiteS3Adapter`'s
 * runtime-configurable optional destination). `AppConfigService`/
 * `redisClientProvider` are NO LONGER declared as local providers here —
 * the `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides both
 * once for the whole app; see that file's doc comment for the full
 * consolidation write-up.
 *
 * **Controllers array verified explicitly** — per this task's own standing
 * warning about a past near-miss (a `controllers` array once forgotten
 * despite `tsc` passing clean) and Module 18's own wildcard-vs-static
 * route-collision lesson (checked on both controllers' own doc comments —
 * `backups`/`ops` are disjoint single-segment prefixes, no collision with
 * each other or any other module): both `BackupsController` and
 * `OpsController` ARE present below.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BkpBackupRunEntity, BkpRestoreRunEntity]), FilesModule, SettingsModule],
  controllers: [BackupsController, OpsController],
  providers: [
    BkpBackupRunRepository,
    BkpRestoreRunRepository,
    BackupExecutorService,
    BackupStorageClient,
    OffsiteS3Adapter,
    RowCountSamplerService,
    BackupOrchestratorService,
    RestoreVerificationService,
    OpsHealthService,
  ],
  exports: [BkpBackupRunRepository, BkpRestoreRunRepository, BackupOrchestratorService, RestoreVerificationService, OpsHealthService],
})
export class BackupsOpsModule {}
