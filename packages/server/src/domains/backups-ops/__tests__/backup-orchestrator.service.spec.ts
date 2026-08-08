import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DataSource } from "typeorm";
import { BackupOrchestratorService } from "../application/backup-orchestrator.service";
import { BkpBackupRunEntity } from "../domain/bkp-backup-run.entity";

interface FakeAppConfig {
  backupPassphrase: string;
  backupLocalDir: string;
  backupMinioBucket: string;
  minioBucketDefault: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

function makeConfig(localDir: string): FakeAppConfig {
  return {
    backupPassphrase: "test-only-backup-passphrase",
    backupLocalDir: localDir,
    backupMinioBucket: "klickit-backups",
    minioBucketDefault: "klickit-files",
    dbHost: "localhost",
    dbPort: 5432,
    dbName: "klickit_dev",
    dbUser: "kfe_app",
    dbPassword: "changeme",
  };
}

describe("BackupOrchestratorService", () => {
  let backupRunRepository: { create: jest.Mock; save: jest.Mock; findForRetentionPruning: jest.Mock; deleteById: jest.Mock };
  let storage: { putObject: jest.Mock; deleteObject: jest.Mock };
  let executor: {
    dumpDatabase: jest.Mock;
    restoreDatabase: jest.Mock;
    createTarArchive: jest.Mock;
    extractTarArchive: jest.Mock;
    computeSha256: jest.Mock;
  };
  let backupStorageClient: { mirrorBucketToDir: jest.Mock; getObject: jest.Mock; listObjects: jest.Mock };
  let offsiteS3Adapter: { getConfig: jest.Mock; putObject: jest.Mock; getObject: jest.Mock; deleteObject: jest.Mock };
  let rowCountSampler: { captureFromDataSource: jest.Mock; captureFromConnectionConfig: jest.Mock };
  let config: FakeAppConfig;
  let localDir: string;
  let service: BackupOrchestratorService;

  let savedRun: BkpBackupRunEntity;

  beforeEach(async () => {
    localDir = await fs.mkdtemp(path.join(os.tmpdir(), "bkp-orch-test-local-"));

    savedRun = {
      id: "run-1",
      startedAt: new Date(),
      finishedAt: null,
      kind: "MANUAL",
      status: "RUNNING",
      sizeBytes: null,
      sha256: null,
      destinations: [],
      manifest: null,
      error: null,
      createdBy: "actor-1",
      updatedBy: "actor-1",
    } as unknown as BkpBackupRunEntity;

    backupRunRepository = {
      create: jest.fn(async (data: Partial<BkpBackupRunEntity>) => {
        savedRun = { ...savedRun, ...data } as BkpBackupRunEntity;
        return savedRun;
      }),
      save: jest.fn(async (entity: BkpBackupRunEntity) => {
        savedRun = entity;
        return entity;
      }),
      findForRetentionPruning: jest.fn(async () => []),
      deleteById: jest.fn(async () => undefined),
    };

    storage = {
      putObject: jest.fn(async () => ({ sha256: "x", sizeBytes: 1 })),
      deleteObject: jest.fn(async () => undefined),
    };

    executor = {
      dumpDatabase: jest.fn(async (_cfg: unknown, outputPath: string) => {
        await fs.writeFile(outputPath, "stub-db-dump-bytes");
        return { path: outputPath, sizeBytes: 19 };
      }),
      restoreDatabase: jest.fn(async () => undefined),
      createTarArchive: jest.fn(async (_sources: string[], outputPath: string) => {
        await fs.writeFile(outputPath, "stub-tar-bytes");
        return { path: outputPath, sizeBytes: 14 };
      }),
      extractTarArchive: jest.fn(async () => undefined),
      computeSha256: jest.fn(async () => "fixed-test-sha256"),
    };

    backupStorageClient = {
      mirrorBucketToDir: jest.fn(async () => ({ objectCount: 2, totalBytes: 500 })),
      getObject: jest.fn(async () => Buffer.from("stub")),
      listObjects: jest.fn(async () => []),
    };

    offsiteS3Adapter = {
      getConfig: jest.fn(async () => null),
      putObject: jest.fn(async () => undefined),
      getObject: jest.fn(async () => Buffer.from("stub")),
      deleteObject: jest.fn(async () => undefined),
    };

    rowCountSampler = {
      captureFromDataSource: jest.fn(async () => ({ usr_user: 3 })),
      captureFromConnectionConfig: jest.fn(async () => ({})),
    };

    config = makeConfig(localDir);

    service = new BackupOrchestratorService(
      backupRunRepository as never,
      storage as never,
      executor as never,
      backupStorageClient as never,
      offsiteS3Adapter as never,
      rowCountSampler as never,
      config as never,
      {} as DataSource,
    );
  });

  afterEach(async () => {
    await fs.rm(localDir, { recursive: true, force: true }).catch(() => undefined);
    jest.restoreAllMocks();
  });

  describe("runBackup — success path", () => {
    it("ends status='OK' with a populated manifest and a LOCAL + MINIO destination fan-out", async () => {
      const result = await service.runBackup("MANUAL", "actor-1");

      expect(result.status).toBe("OK");
      expect(result.error).toBeNull();
      expect(result.sha256).toBe("fixed-test-sha256");
      expect(result.finishedAt).toBeInstanceOf(Date);
      expect(result.manifest).not.toBeNull();
      expect(result.manifest?.tableRowCounts).toEqual({ usr_user: 3 });
      expect(result.manifest?.dbDumpSizeBytes).toBe(19);
      expect(result.manifest?.filesTarSizeBytes).toBe(500);
      expect(typeof result.manifest?.passphraseCheck).toBe("string");

      const destTypes = result.destinations.map((d) => d.type);
      expect(destTypes).toContain("LOCAL");
      expect(destTypes).toContain("MINIO");
      const local = result.destinations.find((d) => d.type === "LOCAL");
      expect(local?.ok).toBe(true);
      expect(local?.path).toBeDefined();
      const minio = result.destinations.find((d) => d.type === "MINIO");
      expect(minio?.ok).toBe(true);

      // The initial create() call left the row RUNNING; save() is what finalizes it.
      expect(backupRunRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "RUNNING", kind: "MANUAL" }));
      expect(backupRunRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "OK" }));
    });

    it("does NOT fail the overall run when the best-effort MINIO destination upload fails — records ok:false instead", async () => {
      storage.putObject.mockRejectedValueOnce(new Error("MinIO connection refused"));

      const result = await service.runBackup("SCHEDULED", null);

      expect(result.status).toBe("OK");
      const minio = result.destinations.find((d) => d.type === "MINIO");
      expect(minio?.ok).toBe(false);
      expect(minio?.error).toContain("MinIO connection refused");
    });
  });

  describe("runBackup — always-terminal-state guarantee", () => {
    it("ends status='FAILED' (never stuck RUNNING) when pg_dump fails mid-flow", async () => {
      executor.dumpDatabase.mockRejectedValueOnce(new Error("pg_dump not found on PATH"));

      const result = await service.runBackup("MANUAL", "actor-1");

      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("pg_dump not found on PATH");
      expect(result.finishedAt).toBeInstanceOf(Date);
      // Every save() call recorded a terminal status — never 'RUNNING'.
      for (const call of backupRunRepository.save.mock.calls) {
        expect((call[0] as BkpBackupRunEntity).status).not.toBe("RUNNING");
      }
    });

    it("ends status='FAILED' when the files-bucket mirror step fails (MinIO unreachable)", async () => {
      backupStorageClient.mirrorBucketToDir.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

      const result = await service.runBackup("SCHEDULED", null);

      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("Files-bucket mirror failed");
    });

    it("ends status='FAILED' when tar archiving fails", async () => {
      executor.createTarArchive.mockRejectedValueOnce(new Error("tar not found on PATH"));

      const result = await service.runBackup("MANUAL", "actor-1");

      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("tar not found on PATH");
    });

    it("ends status='FAILED' when row-count capture fails, still returning a terminal row (not throwing out of runBackup())", async () => {
      rowCountSampler.captureFromDataSource.mockRejectedValueOnce(new Error("DB connection lost"));

      const result = await service.runBackup("MANUAL", "actor-1");

      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("DB connection lost");
    });
  });

  describe("pruneOldBackups", () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    function makeRun(id: string, daysAgo: number): BkpBackupRunEntity {
      return {
        id,
        startedAt: new Date(Date.now() - daysAgo * 40 * MS_PER_DAY),
        kind: "SCHEDULED",
        status: "OK",
        destinations: [
          { type: "LOCAL", path: `/nonexistent/${id}.enc`, ok: true },
          { type: "MINIO", bucket: "klickit-backups", key: `${id}.enc`, ok: true },
        ],
      } as unknown as BkpBackupRunEntity;
    }

    it("queries findForRetentionPruning('SCHEDULED') only — MANUAL/PRE_UPDATE runs are never GFS-pruned", async () => {
      await service.pruneOldBackups();
      expect(backupRunRepository.findForRetentionPruning).toHaveBeenCalledWith("SCHEDULED");
      expect(backupRunRepository.findForRetentionPruning).toHaveBeenCalledTimes(1);
    });

    it("prunes exactly the runs classifyRetention() would prune, deleting their destination objects and their row", async () => {
      // 14 runs, spaced 40 days apart -> distinct day/week/month buckets each
      // (same construction as retention.util.spec.ts) -> exactly the 12 most
      // recent survive, the oldest 2 are pruned.
      const runs = Array.from({ length: 14 }, (_, i) => makeRun(`run-${i}`, i));
      backupRunRepository.findForRetentionPruning.mockResolvedValue(runs);

      const result = await service.pruneOldBackups();

      expect(result.prunedCount).toBe(2);
      expect(result.prunedRunIds.sort()).toEqual(["run-12", "run-13"].sort());

      expect(backupRunRepository.deleteById).toHaveBeenCalledTimes(2);
      expect(backupRunRepository.deleteById).toHaveBeenCalledWith("run-12");
      expect(backupRunRepository.deleteById).toHaveBeenCalledWith("run-13");
      // Survivors are never deleted.
      expect(backupRunRepository.deleteById).not.toHaveBeenCalledWith("run-0");

      // MINIO destination cleanup attempted for both pruned runs.
      expect(storage.deleteObject).toHaveBeenCalledWith("klickit-backups", "run-12.enc");
      expect(storage.deleteObject).toHaveBeenCalledWith("klickit-backups", "run-13.enc");
    });

    it("prunes nothing when every candidate survives (fewer runs than any GFS cap)", async () => {
      const runs = [makeRun("run-a", 0), makeRun("run-b", 1), makeRun("run-c", 2)];
      backupRunRepository.findForRetentionPruning.mockResolvedValue(runs);

      const result = await service.pruneOldBackups();

      expect(result.prunedCount).toBe(0);
      expect(backupRunRepository.deleteById).not.toHaveBeenCalled();
    });
  });
});
