import { Injectable } from "@nestjs/common";
import { createTarArchive, dumpDatabase, extractTarArchive, computeSha256, PgConnectionConfig, restoreDatabase } from "./backup-executor";

/**
 * Thin injectable delegate over `backup-executor.ts`'s plain functions —
 * same reasoning `domains/integrations`' `WebhookHttpClient` documents for
 * why it exists as its own injectable class rather than inlining the I/O:
 * `BackupOrchestratorService`/`RestoreVerificationService` can then depend on
 * an ordinary constructor-injected mock in their own unit tests (asserting
 * `runBackup()`'s always-terminal-state guarantee, `verifyBackup()`'s
 * row-count comparison, etc.) without any real `child_process`/`pg_dump`
 * I/O — `backup-executor.ts`'s OWN unit test is what mocks
 * `node:child_process` directly to cover ENOENT/non-zero-exit handling.
 */
@Injectable()
export class BackupExecutorService {
  dumpDatabase(config: PgConnectionConfig, outputPath: string): ReturnType<typeof dumpDatabase> {
    return dumpDatabase(config, outputPath);
  }

  restoreDatabase(config: PgConnectionConfig, dumpPath: string): ReturnType<typeof restoreDatabase> {
    return restoreDatabase(config, dumpPath);
  }

  createTarArchive(sourcePaths: readonly string[], outputPath: string): ReturnType<typeof createTarArchive> {
    return createTarArchive(sourcePaths, outputPath);
  }

  extractTarArchive(archivePath: string, destDir: string): ReturnType<typeof extractTarArchive> {
    return extractTarArchive(archivePath, destDir);
  }

  computeSha256(filePath: string): ReturnType<typeof computeSha256> {
    return computeSha256(filePath);
  }
}
