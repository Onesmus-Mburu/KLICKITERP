import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { decryptBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BkpRestoreRunEntity } from "../domain/bkp-restore-run.entity";
import { BkpBackupRunEntity } from "../domain/bkp-backup-run.entity";
import { BkpBackupRunRepository } from "../infrastructure/bkp-backup-run.repository";
import { BkpRestoreRunRepository } from "../infrastructure/bkp-restore-run.repository";
import { BackupExecutorService } from "../infrastructure/backup-executor.service";
import { PgConnectionConfig } from "../infrastructure/backup-executor";
import { BackupStorageClient } from "../infrastructure/backup-storage-client";
import { OffsiteS3Adapter } from "../infrastructure/offsite-s3.adapter";
import { RowCountSamplerService } from "../infrastructure/row-count-sampler.service";
import { deriveBackupKeyBase64, passphraseMatches } from "./backup-encryption.util";

export interface RowCountComparisonResult {
  allMatch: boolean;
  mismatches: { table: string; expected: number; actual: number }[];
}

/** Pure comparison — `expected` comes from `bkp_backup_run.manifest.tableRowCounts`, `actual` from the restore target's live counts (same table set, per `verifyBackup()`). A table missing from `actual` counts as a mismatch (`actual: -1`), never silently ignored. */
export function compareRowCounts(expected: Record<string, number>, actual: Record<string, number>): RowCountComparisonResult {
  const mismatches: { table: string; expected: number; actual: number }[] = [];
  for (const [table, expectedCount] of Object.entries(expected)) {
    const actualCount = actual[table] ?? -1;
    if (actualCount !== expectedCount) {
      mismatches.push({ table, expected: expectedCount, actual: actualCount });
    }
  }
  return { allMatch: mismatches.length === 0, mismatches };
}

/**
 * FR-BKP-003.1 — weekly restore-verify: real `pg_restore` into an
 * already-reachable target, then a real row-count smoke query compared
 * against the backup's own manifest, logged either way (this service never
 * silently passes/swallows a mismatch — `bkp_restore_run.status`/`.notes`
 * always records the outcome).
 *
 * **Scope boundary — read carefully**: this method takes `targetConnectionConfig`
 * as a parameter and assumes it is ALREADY REACHABLE. Spinning up the actual
 * "scratch container" target (a fresh, disposable Postgres instance to
 * restore into) is a deployment/ops-tooling concern (`tools/` scripts, Phase
 * 8 territory per docs/phase-3/03-deployment-infrastructure.md), NOT
 * application code, and is explicitly out of scope for this pass. What IS
 * real here: the actual `pg_restore` invocation and the actual row-count
 * comparison logic — genuinely callable, exercised by this module's own
 * unit tests against a mocked target, not testable end-to-end live in this
 * environment (no Postgres reachable at all here — docs/phase-5/PROGRESS.md
 * "Environment status" — same documented gap as `pg_dump` itself).
 * Automatic weekly SCHEDULING of this method is likewise out of scope — no
 * worker/cron exists anywhere in this codebase (same gap as every other
 * module); `verifyBackup()` is a real, correct, manually/on-demand callable
 * method (`POST /backups/:id/verify-restore`), not auto-triggered.
 */
@Injectable()
export class RestoreVerificationService {
  constructor(
    private readonly backupRunRepository: BkpBackupRunRepository,
    private readonly restoreRunRepository: BkpRestoreRunRepository,
    private readonly executor: BackupExecutorService,
    private readonly rowCountSampler: RowCountSamplerService,
    private readonly backupStorageClient: BackupStorageClient,
    private readonly offsiteS3Adapter: OffsiteS3Adapter,
    private readonly config: AppConfigService,
  ) {}

  async verifyBackup(backupRunId: string, targetConnectionConfig: PgConnectionConfig, actorId: string | null): Promise<BkpRestoreRunEntity> {
    const backupRun = await this.backupRunRepository.findByIdOrFail(backupRunId);
    if (backupRun.status !== "OK" || !backupRun.manifest) {
      throw new ValidationException(`Backup run ${backupRunId} has no successful manifest to verify a restore against`);
    }
    const manifest = backupRun.manifest;

    const restoreRun = await this.restoreRunRepository.create({
      fromManifest: manifest,
      startedAt: new Date(),
      finishedAt: null,
      status: "RUNNING",
      notes: null,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "klickit-restore-verify-"));
    try {
      const keyBase64 = deriveBackupKeyBase64(this.config.backupPassphrase);
      if (!passphraseMatches(manifest.passphraseCheck, keyBase64)) {
        throw new Error("BACKUP_PASSPHRASE does not match the passphrase this backup was encrypted with — cannot decrypt");
      }

      const encryptedPath = await this.materializeBackupFile(backupRun, workDir);
      const encryptedBuffer = await fs.readFile(encryptedPath);
      const tarBuffer = decryptBuffer(encryptedBuffer, keyBase64);
      const tarPath = path.join(workDir, "archive.tar");
      await fs.writeFile(tarPath, tarBuffer);

      const extractDir = path.join(workDir, "extracted");
      await this.executor.extractTarArchive(tarPath, extractDir);
      const dumpPath = path.join(extractDir, "db.dump");

      await this.executor.restoreDatabase(targetConnectionConfig, dumpPath);

      const expectedCounts = manifest.tableRowCounts;
      const actualCounts = await this.rowCountSampler.captureFromConnectionConfig(targetConnectionConfig, Object.keys(expectedCounts));
      const comparison = compareRowCounts(expectedCounts, actualCounts);

      restoreRun.status = comparison.allMatch ? "OK" : "FAILED";
      restoreRun.notes = comparison.allMatch
        ? `Row-count smoke query matched the manifest across ${Object.keys(expectedCounts).length} sampled table(s).`
        : `Row-count mismatch on ${comparison.mismatches.length} table(s): ${comparison.mismatches
            .map((m) => `${m.table} (expected ${m.expected}, actual ${m.actual})`)
            .join("; ")}`;
      restoreRun.finishedAt = new Date();
      restoreRun.updatedBy = actorId;
      return await this.restoreRunRepository.save(restoreRun);
    } catch (error) {
      restoreRun.status = "FAILED";
      restoreRun.notes = `Restore verification failed: ${(error as Error).message}`;
      restoreRun.finishedAt = new Date();
      restoreRun.updatedBy = actorId;
      return await this.restoreRunRepository.save(restoreRun);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Fetches the encrypted archive back from whichever destination succeeded, preferring LOCAL (no network) over MINIO over OFFSITE_S3. */
  private async materializeBackupFile(backupRun: BkpBackupRunEntity, workDir: string): Promise<string> {
    const destPath = path.join(workDir, "archive.tar.enc");

    const local = backupRun.destinations.find((d) => d.type === "LOCAL" && d.ok && d.path);
    if (local?.path) {
      await fs.copyFile(local.path, destPath);
      return destPath;
    }

    const minio = backupRun.destinations.find((d) => d.type === "MINIO" && d.ok && d.bucket && d.key);
    if (minio?.bucket && minio.key) {
      const buffer = await this.backupStorageClient.getObject(minio.bucket, minio.key);
      await fs.writeFile(destPath, buffer);
      return destPath;
    }

    const offsite = backupRun.destinations.find((d) => d.type === "OFFSITE_S3" && d.ok && d.bucket && d.key);
    if (offsite?.bucket && offsite.key) {
      const offsiteConfig = await this.offsiteS3Adapter.getConfig();
      if (offsiteConfig) {
        const buffer = await this.offsiteS3Adapter.getObject(offsiteConfig, offsite.key);
        await fs.writeFile(destPath, buffer);
        return destPath;
      }
    }

    throw new Error("No reachable destination holds this backup run's encrypted archive (LOCAL/MINIO/OFFSITE_S3 all unavailable)");
  }
}
