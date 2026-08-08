import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { encryptBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { STORAGE_PORT, StoragePort } from "../../../platform/files";
import { BackupDestinationResult, BackupManifest, BkpBackupRunEntity, BkpBackupRunKind } from "../domain/bkp-backup-run.entity";
import { BkpBackupRunRepository } from "../infrastructure/bkp-backup-run.repository";
import { BackupExecutorService } from "../infrastructure/backup-executor.service";
import { PgConnectionConfig } from "../infrastructure/backup-executor";
import { BackupStorageClient } from "../infrastructure/backup-storage-client";
import { OffsiteS3Adapter } from "../infrastructure/offsite-s3.adapter";
import { RowCountSamplerService } from "../infrastructure/row-count-sampler.service";
import { buildPassphraseCheck, deriveBackupKeyBase64 } from "./backup-encryption.util";
import { classifyRetention } from "./retention.util";

export interface PruneResult {
  prunedCount: number;
  prunedRunIds: string[];
}

/**
 * `pruneOldBackups()` only ever GFS-rotates `kind='SCHEDULED'` runs — the
 * nightly-cron routine docs/phase-3/03-deployment-infrastructure.md §6's
 * 7/4/12 rotation diagram is describing. `MANUAL`/`PRE_UPDATE` runs are
 * deliberately excluded from automatic pruning: a `MANUAL` backup was taken
 * for a specific, presumably still-relevant reason, and a `PRE_UPDATE`
 * backup is the upgrade-rollback safety net (docs/phase-3/03 §4.2) — neither
 * should silently disappear on the SAME rolling schedule as routine nightly
 * backups. Retiring old `MANUAL`/`PRE_UPDATE` runs is left as a manual/
 * future admin action, not attempted by this pass.
 */
const RETENTION_MANAGED_KIND: BkpBackupRunKind = "SCHEDULED";

/**
 * Module 20 (Backups/Ops) — the real backup flow
 * (docs/phase-3/03-deployment-infrastructure.md §6): DB dump (`pg_dump -Fc`)
 * + MinIO/files-bucket mirror + `.env` snapshot -> tar -> AES-256-GCM
 * encrypt (`BACKUP_PASSPHRASE`) -> SHA-256 manifest -> fan out to
 * destinations -> GFS retention pruning. `runBackup()`'s whole flow is
 * wrapped in one try/catch/finally so the `bkp_backup_run` row it creates is
 * ALWAYS left in a terminal state (`'OK'`/`'FAILED'`), never stuck
 * `'RUNNING'`, even when `pg_dump`/`tar` aren't installed or MinIO is
 * unreachable (this dev environment has neither — docs/phase-5/PROGRESS.md
 * "Environment status" — so `runBackup()` genuinely, honestly fails end to
 * end here; that is CORRECT behavior, not a bug, same standard every other
 * external-system-touching module in this codebase is held to).
 */
@Injectable()
export class BackupOrchestratorService {
  constructor(
    private readonly backupRunRepository: BkpBackupRunRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly executor: BackupExecutorService,
    private readonly backupStorageClient: BackupStorageClient,
    private readonly offsiteS3Adapter: OffsiteS3Adapter,
    private readonly rowCountSampler: RowCountSamplerService,
    private readonly config: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async runBackup(kind: BkpBackupRunKind, initiatedBy: string | null): Promise<BkpBackupRunEntity> {
    const run = await this.backupRunRepository.create({
      startedAt: new Date(),
      finishedAt: null,
      kind,
      status: "RUNNING",
      sizeBytes: null,
      sha256: null,
      destinations: [],
      manifest: null,
      error: null,
      createdBy: initiatedBy,
      updatedBy: initiatedBy,
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "klickit-backup-"));
    try {
      const dbConfig = this.resolveAppDbConnectionConfig();
      const dumpPath = path.join(workDir, "db.dump");
      const { sizeBytes: dbDumpSizeBytes } = await this.executor.dumpDatabase(dbConfig, dumpPath);

      const filesDir = path.join(workDir, "files");
      await fs.mkdir(filesDir, { recursive: true });
      let filesTarSizeBytes = 0;
      try {
        const mirrorResult = await this.backupStorageClient.mirrorBucketToDir(this.config.minioBucketDefault, filesDir);
        filesTarSizeBytes = mirrorResult.totalBytes;
      } catch (error) {
        throw new Error(`Files-bucket mirror failed: ${(error as Error).message}`);
      }

      const envSnapshotPath = path.join(workDir, "env-snapshot.json");
      await fs.writeFile(envSnapshotPath, JSON.stringify(this.buildEnvSnapshot(), null, 2), "utf8");

      const tarPath = path.join(workDir, "archive.tar");
      await this.executor.createTarArchive([dumpPath, filesDir, envSnapshotPath], tarPath);

      const keyBase64 = deriveBackupKeyBase64(this.config.backupPassphrase);
      const tarBuffer = await fs.readFile(tarPath);
      const encryptedBuffer = encryptBuffer(tarBuffer, keyBase64);
      const encryptedPath = path.join(workDir, "archive.tar.enc");
      await fs.writeFile(encryptedPath, encryptedBuffer);

      const sha256 = await this.executor.computeSha256(encryptedPath);
      const destinations = await this.uploadToDestinations(run.id, encryptedPath, encryptedBuffer);

      const tableRowCounts = await this.rowCountSampler.captureFromDataSource(this.dataSource);

      const manifest: BackupManifest = {
        sha256,
        sizeBytes: encryptedBuffer.byteLength,
        dbDumpSizeBytes,
        filesTarSizeBytes,
        createdAt: new Date().toISOString(),
        kind,
        tableRowCounts,
        passphraseCheck: buildPassphraseCheck(keyBase64),
      };

      run.status = "OK";
      run.finishedAt = new Date();
      run.sizeBytes = String(encryptedBuffer.byteLength);
      run.sha256 = sha256;
      run.destinations = destinations;
      run.manifest = manifest;
      run.error = null;
      run.updatedBy = initiatedBy;
      return await this.backupRunRepository.save(run);
    } catch (error) {
      run.status = "FAILED";
      run.finishedAt = new Date();
      run.error = (error as Error).message;
      run.updatedBy = initiatedBy;
      return await this.backupRunRepository.save(run);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * GFS retention pruning (`retention.util.ts`'s `classifyRetention()` —
   * see that file for the full algorithm write-up). Only ever operates on
   * `kind='SCHEDULED'` runs (`RETENTION_MANAGED_KIND`, see its own doc
   * comment). Deletes each pruned run's destination files/objects
   * (best-effort per destination — `deleteRunDestinations()`) AND the
   * `bkp_backup_run` row itself.
   */
  async pruneOldBackups(): Promise<PruneResult> {
    const candidates = await this.backupRunRepository.findForRetentionPruning(RETENTION_MANAGED_KIND);
    const { keepIds } = classifyRetention(candidates.map((run) => ({ id: run.id, startedAt: run.startedAt })));
    const toPrune = candidates.filter((run) => !keepIds.has(run.id));

    for (const run of toPrune) {
      await this.deleteRunDestinations(run);
      await this.backupRunRepository.deleteById(run.id);
    }

    return { prunedCount: toPrune.length, prunedRunIds: toPrune.map((run) => run.id) };
  }

  private async uploadToDestinations(runId: string, encryptedPath: string, encryptedBuffer: Buffer): Promise<BackupDestinationResult[]> {
    const results: BackupDestinationResult[] = [];
    const objectKey = `${runId}.enc`;

    // LOCAL is the primary, critical destination — a failure here propagates
    // (caught by runBackup()'s outer try/catch -> the run ends FAILED), since
    // a backup with nowhere durable to land is not a real backup.
    const localDir = this.config.backupLocalDir;
    await fs.mkdir(localDir, { recursive: true });
    const localPath = path.join(localDir, objectKey);
    await fs.copyFile(encryptedPath, localPath);
    results.push({ type: "LOCAL", path: localPath, ok: true });

    // MINIO and OFFSITE_S3 are best-effort mirrors — a failure is recorded in
    // `destinations[].ok/.error` (visible on `/ops` and via GET /backups/:id)
    // but does NOT fail the overall run, since the LOCAL copy already
    // succeeded and these are supplementary redundancy, not the only copy.
    try {
      await this.storage.putObject(this.config.backupMinioBucket, objectKey, encryptedBuffer, "application/octet-stream");
      results.push({ type: "MINIO", bucket: this.config.backupMinioBucket, key: objectKey, ok: true });
    } catch (error) {
      results.push({ type: "MINIO", bucket: this.config.backupMinioBucket, key: objectKey, ok: false, error: (error as Error).message });
    }

    const offsiteConfig = await this.offsiteS3Adapter.getConfig();
    if (offsiteConfig) {
      try {
        await this.offsiteS3Adapter.putObject(offsiteConfig, objectKey, encryptedBuffer);
        results.push({ type: "OFFSITE_S3", bucket: offsiteConfig.bucket, key: objectKey, ok: true });
      } catch (error) {
        results.push({ type: "OFFSITE_S3", bucket: offsiteConfig.bucket, key: objectKey, ok: false, error: (error as Error).message });
      }
    }

    return results;
  }

  private async deleteRunDestinations(run: BkpBackupRunEntity): Promise<void> {
    for (const destination of run.destinations) {
      if (!destination.ok) continue;
      try {
        if (destination.type === "LOCAL" && destination.path) {
          await fs.unlink(destination.path);
        } else if (destination.type === "MINIO" && destination.bucket && destination.key) {
          await this.storage.deleteObject(destination.bucket, destination.key);
        } else if (destination.type === "OFFSITE_S3" && destination.bucket && destination.key) {
          const offsiteConfig = await this.offsiteS3Adapter.getConfig();
          if (offsiteConfig) {
            await this.offsiteS3Adapter.deleteObject(offsiteConfig, destination.key);
          }
        }
      } catch {
        // Best-effort only, same rationale FilesService.upload()'s own
        // compensating-delete doc comment gives: a failed destination
        // delete just leaves a small orphaned blob, not a data-integrity
        // problem — it must never block pruning the run row itself.
      }
    }
  }

  private resolveAppDbConnectionConfig(): PgConnectionConfig {
    return {
      host: this.config.dbHost,
      port: this.config.dbPort,
      database: this.config.dbName,
      user: this.config.dbUser,
      password: this.config.dbPassword,
    };
  }

  /**
   * The ".env snapshot" step (docs/phase-3/03-deployment-infrastructure.md
   * §6) — the WHOLE archive (this snapshot included) goes through
   * AES-256-GCM encryption before it ever touches a destination, so
   * capturing real env values here is safe at rest, same trust boundary the
   * rest of the encrypted archive already relies on.
   */
  private buildEnvSnapshot(): Record<string, string | undefined> {
    return { ...process.env };
  }
}
