import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { BkpBackupRunEntity } from "../domain/bkp-backup-run.entity";
import { BkpRestoreRunEntity } from "../domain/bkp-restore-run.entity";
import { BkpBackupRunRepository } from "../infrastructure/bkp-backup-run.repository";
import { BkpRestoreRunRepository } from "../infrastructure/bkp-restore-run.repository";

/**
 * Module 20 (Backups/Ops) capstone integration test — mirrors
 * `domains/integrations/__tests__/integrations-e2e.integration.spec.ts`'s
 * pattern (real repository instances, no Nest DI, self-skips without a
 * reachable Postgres). This module's real, external-process-touching
 * mechanics (`pg_dump`/`pg_restore`/`tar` shell-outs, MinIO fan-out) are
 * NOT exercised here — this environment has neither Postgres NOR MinIO
 * reachable (docs/phase-5/PROGRESS.md "Environment status"), and those
 * paths are already covered by this module's own mocked unit tests
 * (`backup-executor.spec.ts`, `backup-orchestrator.service.spec.ts`).
 * What THIS test covers, once Docker is up: real `bkp_backup_run`/
 * `bkp_restore_run` row round-trips against the actual migrated schema, and
 * the real DB-connectivity + `pg_database_size(current_database())` query
 * `OpsHealthService.checkDatabase()` runs — the one piece of this module
 * that genuinely needs a live database to prove out at all.
 */
describe("backups-ops module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[backups-ops-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "real bkp_backup_run/bkp_restore_run round-trip + real SELECT 1 / pg_database_size(current_database()) against the live test DB",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[backups-ops-e2e.integration.spec] SKIPPED (no DB) — backups-ops capstone flow");
        return; // vacuous pass — the skip decision is only known async, after `it()` registration.
      }
      const source = dataSource;
      const config = new AppConfigService();

      const backupRunRepository = new BkpBackupRunRepository(source.getRepository(BkpBackupRunEntity) as never);
      const restoreRunRepository = new BkpRestoreRunRepository(source.getRepository(BkpRestoreRunEntity) as never);

      // Real DB connectivity ping + real DB-size query — the mechanism
      // `OpsHealthService.checkDatabase()` runs against a real Postgres.
      const pingRows: { "?column?": number }[] = await source.query("SELECT 1");
      expect(pingRows[0]?.["?column?"]).toBe(1);

      const sizeRows: { size: string }[] = await source.query("SELECT pg_database_size(current_database())::text AS size");
      expect(Number(sizeRows[0]?.size)).toBeGreaterThan(0);

      let backupRun: BkpBackupRunEntity | null = null;
      let restoreRun: BkpRestoreRunEntity | null = null;
      try {
        backupRun = await backupRunRepository.create({
          startedAt: new Date(),
          finishedAt: new Date(),
          kind: "MANUAL",
          status: "OK",
          sizeBytes: "1024",
          sha256: "e2e-test-sha256",
          destinations: [{ type: "LOCAL", path: "/tmp/e2e-test.enc", ok: true }],
          manifest: {
            sha256: "e2e-test-sha256",
            sizeBytes: 1024,
            dbDumpSizeBytes: 900,
            filesTarSizeBytes: 100,
            createdAt: new Date().toISOString(),
            kind: "MANUAL",
            tableRowCounts: { usr_permission: 1 },
            passphraseCheck: "unused-in-this-e2e-test",
          },
          error: null,
        });
        expect(backupRun.status).toBe("OK");

        const fetched = await backupRunRepository.findByIdOrFail(backupRun.id);
        expect(fetched.sha256).toBe("e2e-test-sha256");

        const latest = await backupRunRepository.findLatest();
        expect(latest?.id).toBe(backupRun.id);

        restoreRun = await restoreRunRepository.create({
          fromManifest: backupRun.manifest!,
          startedAt: new Date(),
          finishedAt: new Date(),
          status: "OK",
          notes: "e2e round-trip",
        });
        expect(restoreRun.status).toBe("OK");

        const fetchedRestore = await restoreRunRepository.findByIdOrFail(restoreRun.id);
        expect(fetchedRestore.notes).toBe("e2e round-trip");

        // Sanity: AppConfigService's new getters resolve without throwing.
        expect(typeof config.backupPassphrase).toBe("string");
        expect(typeof config.dbHost).toBe("string");
      } finally {
        if (backupRun) {
          await source.getRepository(BkpBackupRunEntity).delete({ id: backupRun.id });
        }
        if (restoreRun) {
          await source.getRepository(BkpRestoreRunEntity).delete({ id: restoreRun.id });
        }
      }
    },
    30_000,
  );
});
