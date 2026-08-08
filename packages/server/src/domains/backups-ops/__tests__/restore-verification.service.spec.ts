import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { encryptBuffer } from "../../../shared/crypto/aes-gcm.util";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { buildPassphraseCheck, deriveBackupKeyBase64 } from "../application/backup-encryption.util";
import { compareRowCounts, RestoreVerificationService } from "../application/restore-verification.service";
import { BackupManifest, BkpBackupRunEntity } from "../domain/bkp-backup-run.entity";
import { BkpRestoreRunEntity } from "../domain/bkp-restore-run.entity";

const TEST_PASSPHRASE = "test-only-restore-verify-passphrase";
const TARGET = { host: "localhost", port: 5432, database: "scratch_target", user: "kfe_app", password: "changeme" };

describe("RestoreVerificationService", () => {
  let backupRunRepository: { findByIdOrFail: jest.Mock };
  let restoreRunRepository: { create: jest.Mock; save: jest.Mock };
  let executor: { extractTarArchive: jest.Mock; restoreDatabase: jest.Mock };
  let rowCountSampler: { captureFromConnectionConfig: jest.Mock };
  let backupStorageClient: { getObject: jest.Mock };
  let offsiteS3Adapter: { getConfig: jest.Mock; getObject: jest.Mock };
  let config: { backupPassphrase: string };
  let service: RestoreVerificationService;

  let localDir: string;
  let localEncPath: string;
  let manifest: BackupManifest;
  let backupRun: BkpBackupRunEntity;
  let savedRestoreRun: BkpRestoreRunEntity;

  beforeEach(async () => {
    localDir = await fs.mkdtemp(path.join(os.tmpdir(), "bkp-restore-verify-test-"));
    localEncPath = path.join(localDir, "archive.tar.enc");

    const keyBase64 = deriveBackupKeyBase64(TEST_PASSPHRASE);
    const stubTarBuffer = Buffer.from("stub-tar-archive-bytes");
    const encrypted = encryptBuffer(stubTarBuffer, keyBase64);
    await fs.writeFile(localEncPath, encrypted);

    manifest = {
      sha256: "irrelevant-for-this-test",
      sizeBytes: encrypted.byteLength,
      dbDumpSizeBytes: 100,
      filesTarSizeBytes: 50,
      createdAt: new Date().toISOString(),
      kind: "SCHEDULED",
      tableRowCounts: { usr_user: 3, gl_account: 20 },
      passphraseCheck: buildPassphraseCheck(keyBase64),
    };

    backupRun = {
      id: "backup-run-1",
      status: "OK",
      manifest,
      destinations: [{ type: "LOCAL", path: localEncPath, ok: true }],
    } as unknown as BkpBackupRunEntity;

    backupRunRepository = { findByIdOrFail: jest.fn(async () => backupRun) };

    savedRestoreRun = { id: "restore-run-1", status: "RUNNING" } as unknown as BkpRestoreRunEntity;
    restoreRunRepository = {
      create: jest.fn(async (data: Partial<BkpRestoreRunEntity>) => {
        savedRestoreRun = { ...savedRestoreRun, ...data } as BkpRestoreRunEntity;
        return savedRestoreRun;
      }),
      save: jest.fn(async (entity: BkpRestoreRunEntity) => {
        savedRestoreRun = entity;
        return entity;
      }),
    };

    executor = {
      extractTarArchive: jest.fn(async () => undefined),
      restoreDatabase: jest.fn(async () => undefined),
    };

    rowCountSampler = {
      captureFromConnectionConfig: jest.fn(async () => ({ usr_user: 3, gl_account: 20 })),
    };

    backupStorageClient = { getObject: jest.fn(async () => Buffer.from("unused")) };
    offsiteS3Adapter = { getConfig: jest.fn(async () => null), getObject: jest.fn(async () => Buffer.from("unused")) };
    config = { backupPassphrase: TEST_PASSPHRASE };

    service = new RestoreVerificationService(
      backupRunRepository as never,
      restoreRunRepository as never,
      executor as never,
      rowCountSampler as never,
      backupStorageClient as never,
      offsiteS3Adapter as never,
      config as never,
    );
  });

  afterEach(async () => {
    await fs.rm(localDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("ends status='OK' when the row-count smoke query matches the manifest exactly", async () => {
    const result = await service.verifyBackup("backup-run-1", TARGET, "actor-1");

    expect(result.status).toBe("OK");
    expect(result.notes).toContain("matched the manifest");
    expect(executor.restoreDatabase).toHaveBeenCalledWith(TARGET, expect.stringContaining("db.dump"));
    expect(rowCountSampler.captureFromConnectionConfig).toHaveBeenCalledWith(TARGET, ["usr_user", "gl_account"]);
  });

  it("ends status='FAILED' with per-table mismatch details when a row count doesn't match", async () => {
    rowCountSampler.captureFromConnectionConfig.mockResolvedValueOnce({ usr_user: 3, gl_account: 999 });

    const result = await service.verifyBackup("backup-run-1", TARGET, "actor-1");

    expect(result.status).toBe("FAILED");
    expect(result.notes).toContain("gl_account");
    expect(result.notes).toContain("expected 20");
    expect(result.notes).toContain("actual 999");
  });

  it("ends status='FAILED' when BACKUP_PASSPHRASE doesn't match the backup's own passphrase check", async () => {
    config.backupPassphrase = "a-totally-different-passphrase";

    const result = await service.verifyBackup("backup-run-1", TARGET, "actor-1");

    expect(result.status).toBe("FAILED");
    expect(result.notes).toContain("BACKUP_PASSPHRASE does not match");
    // Fails fast on the passphrase check — never reaches pg_restore.
    expect(executor.restoreDatabase).not.toHaveBeenCalled();
  });

  it("ends status='FAILED' when no destination holds a reachable copy of the archive", async () => {
    backupRun.destinations = [];

    const result = await service.verifyBackup("backup-run-1", TARGET, "actor-1");

    expect(result.status).toBe("FAILED");
    expect(result.notes).toContain("No reachable destination");
  });

  it("throws ValidationException up-front (no restore run created) when the source backup run has no successful manifest", async () => {
    backupRun.status = "FAILED";
    backupRun.manifest = null;

    await expect(service.verifyBackup("backup-run-1", TARGET, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    expect(restoreRunRepository.create).not.toHaveBeenCalled();
  });
});

describe("compareRowCounts", () => {
  it("reports allMatch=true when every expected table's count matches exactly", () => {
    const result = compareRowCounts({ a: 1, b: 2 }, { a: 1, b: 2, c: 999 });
    expect(result.allMatch).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it("reports each mismatching table with expected/actual, and treats a MISSING table as actual=-1", () => {
    const result = compareRowCounts({ a: 1, b: 2 }, { a: 1 });
    expect(result.allMatch).toBe(false);
    expect(result.mismatches).toEqual([{ table: "b", expected: 2, actual: -1 }]);
  });
});
