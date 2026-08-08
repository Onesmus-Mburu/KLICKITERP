import { promises as fsPromises } from "node:fs";
import { OpsHealthService } from "../application/ops-health.service";
import { BkpBackupRunEntity } from "../domain/bkp-backup-run.entity";

describe("OpsHealthService", () => {
  let dataSource: { query: jest.Mock };
  let redis: { ping: jest.Mock };
  let backupStorageClient: { listObjects: jest.Mock };
  let backupRunRepository: { findLatest: jest.Mock };
  let config: { minioBucketDefault: string; backupLocalDir: string };
  let service: OpsHealthService;
  let statfsSpy: jest.SpyInstance;

  beforeEach(() => {
    dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes("pg_database_size")) return [{ size: "123456789" }];
        return [{ "?column?": 1 }];
      }),
    };
    redis = { ping: jest.fn(async () => "PONG") };
    backupStorageClient = { listObjects: jest.fn(async () => []) };
    backupRunRepository = { findLatest: jest.fn(async () => null) };
    config = { minioBucketDefault: "klickit-files", backupLocalDir: "./data/backups" };

    statfsSpy = jest.spyOn(fsPromises, "statfs").mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bfree: 250,
      bavail: 250,
      files: 0,
      ffree: 0,
      type: 0,
    } as unknown as Awaited<ReturnType<typeof fsPromises.statfs>>);

    service = new OpsHealthService(
      dataSource as never,
      redis as never,
      backupStorageClient as never,
      backupRunRepository as never,
      config as never,
    );
  });

  afterEach(() => {
    statfsSpy.mockRestore();
  });

  it("returns ok:true for every sub-check when everything is reachable", async () => {
    const summary = await service.getHealthSummary();

    expect(summary.database.ok).toBe(true);
    expect(summary.database.sizeBytes).toBe(123456789);
    expect(summary.redis.ok).toBe(true);
    expect(summary.minio.ok).toBe(true);
    expect(summary.disk.available).toBe(true);
    expect(summary.disk.usedPercent).toBe(75);
    expect(summary.lastBackup.found).toBe(false);
    expect(typeof summary.appVersion).toBe("string");
    expect(summary.licenseState).toBe("NOT_YET_AVAILABLE");
    expect(summary.queueDepths.note).toMatch(/N\/A/);
    expect(summary.logLevel.settable).toBe(false);
    expect(summary.generatedAt).toEqual(expect.any(String));
  });

  it("a failed DB check does NOT crash the whole summary — other checks still return normally (graceful degradation)", async () => {
    dataSource.query.mockRejectedValue(new Error("connection refused"));

    const summary = await service.getHealthSummary();

    expect(summary.database.ok).toBe(false);
    expect(summary.database.error).toContain("connection refused");
    // Every other check still ran and reported normally.
    expect(summary.redis.ok).toBe(true);
    expect(summary.minio.ok).toBe(true);
    expect(summary.disk.available).toBe(true);
  });

  it("a failed Redis PING does NOT crash the whole summary", async () => {
    redis.ping.mockRejectedValue(new Error("ECONNREFUSED"));

    const summary = await service.getHealthSummary();

    expect(summary.redis.ok).toBe(false);
    expect(summary.redis.error).toContain("ECONNREFUSED");
    expect(summary.database.ok).toBe(true);
  });

  it("a failed MinIO bucket-list does NOT crash the whole summary", async () => {
    backupStorageClient.listObjects.mockRejectedValue(new Error("NoSuchBucket"));

    const summary = await service.getHealthSummary();

    expect(summary.minio.ok).toBe(false);
    expect(summary.minio.error).toContain("NoSuchBucket");
    expect(summary.database.ok).toBe(true);
  });

  it("a failed disk probe (fs.statfs throws) returns {available:false, note} instead of crashing", async () => {
    statfsSpy.mockRejectedValue(new Error("statfs not supported"));

    const summary = await service.getHealthSummary();

    expect(summary.disk.available).toBe(false);
    expect(summary.disk.note).toBeDefined();
    expect(summary.database.ok).toBe(true);
  });

  it("reports lastBackup.found=false when no successful backup run exists yet", async () => {
    const summary = await service.getHealthSummary();
    expect(summary.lastBackup.found).toBe(false);
  });

  it("reports the last successful backup's id/status/age when one exists", async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    backupRunRepository.findLatest.mockResolvedValue({ id: "run-42", startedAt, status: "OK" } as unknown as BkpBackupRunEntity);

    const summary = await service.getHealthSummary();

    expect(summary.lastBackup.found).toBe(true);
    expect(summary.lastBackup.runId).toBe("run-42");
    expect(summary.lastBackup.status).toBe("OK");
    expect(summary.lastBackup.ageHours).toBeGreaterThan(4.9);
    expect(summary.lastBackup.ageHours).toBeLessThan(5.1);
  });
});
