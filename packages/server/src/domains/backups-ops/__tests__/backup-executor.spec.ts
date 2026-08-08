import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
}));

const { execFile } = jest.requireMock("node:child_process") as { execFile: jest.Mock };

import {
  BackupExecutionError,
  BackupToolNotFoundError,
  computeSha256,
  createTarArchive,
  dumpDatabase,
  restoreDatabase,
} from "../infrastructure/backup-executor";

const CONNECTION = { host: "localhost", port: 5432, database: "klickit_dev", user: "kfe_app", password: "secret" };

describe("backup-executor", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("ENOENT — tool not installed", () => {
    it("dumpDatabase() throws a distinct BackupToolNotFoundError when pg_dump isn't on PATH", async () => {
      execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const error = Object.assign(new Error("spawn pg_dump ENOENT"), { code: "ENOENT" });
        cb(error, "", "");
      });

      await expect(dumpDatabase(CONNECTION, "/tmp/out.dump")).rejects.toBeInstanceOf(BackupToolNotFoundError);
      await expect(dumpDatabase(CONNECTION, "/tmp/out.dump")).rejects.toThrow(/pg_dump.*not found on PATH/i);
    });

    it("restoreDatabase() throws a distinct BackupToolNotFoundError when pg_restore isn't on PATH", async () => {
      execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const error = Object.assign(new Error("spawn pg_restore ENOENT"), { code: "ENOENT" });
        cb(error, "", "");
      });

      await expect(restoreDatabase(CONNECTION, "/tmp/dump.dump")).rejects.toBeInstanceOf(BackupToolNotFoundError);
    });

    it("createTarArchive() throws a distinct BackupToolNotFoundError when tar isn't on PATH", async () => {
      execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const error = Object.assign(new Error("spawn tar ENOENT"), { code: "ENOENT" });
        cb(error, "", "");
      });

      await expect(createTarArchive(["/tmp/work/a.txt"], "/tmp/out.tar")).rejects.toBeInstanceOf(BackupToolNotFoundError);
    });
  });

  describe("non-zero exit — the tool ran and failed", () => {
    it("dumpDatabase() throws a distinct BackupExecutionError carrying stderr/exit code, NOT a BackupToolNotFoundError", async () => {
      execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const error = Object.assign(new Error("Command failed"), { code: 1 });
        cb(error, "", "pg_dump: error: connection to server failed");
      });

      let caught: unknown;
      try {
        await dumpDatabase(CONNECTION, "/tmp/out.dump");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BackupExecutionError);
      expect(caught).not.toBeInstanceOf(BackupToolNotFoundError);
      const execError = caught as BackupExecutionError;
      expect(execError.exitCode).toBe(1);
      expect(execError.stderr).toContain("connection to server failed");
    });
  });

  describe("success path — argv-based invocation, no shell string concatenation", () => {
    it("dumpDatabase() invokes pg_dump with -Fc and discrete argv elements, PGPASSWORD via env (not argv)", async () => {
      let capturedArgs: string[] = [];
      let capturedEnv: NodeJS.ProcessEnv | undefined;
      execFile.mockImplementation((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }, cb: (...a: unknown[]) => void) => {
        expect(cmd).toBe("pg_dump");
        capturedArgs = args;
        capturedEnv = opts.env;
        cb(null, "", "");
      });

      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bkp-exec-test-"));
      const outputPath = path.join(workDir, "out.dump");
      await fs.writeFile(outputPath, "stub-dump-bytes");

      const result = await dumpDatabase(CONNECTION, outputPath);

      expect(capturedArgs).toEqual(["-Fc", "-h", "localhost", "-p", "5432", "-U", "kfe_app", "-d", "klickit_dev", "-f", outputPath]);
      expect(capturedArgs.join(" ")).not.toContain("secret"); // password never appears in argv
      expect(capturedEnv?.PGPASSWORD).toBe("secret");
      expect(result.path).toBe(outputPath);
      expect(result.sizeBytes).toBeGreaterThan(0);

      await fs.rm(workDir, { recursive: true, force: true });
    });
  });

  describe("computeSha256", () => {
    it("computes the real streaming SHA-256 of a file's contents", async () => {
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bkp-exec-sha-"));
      const filePath = path.join(workDir, "data.bin");
      await fs.writeFile(filePath, "hello world");

      const digest = await computeSha256(filePath);
      const expected = createHash("sha256").update("hello world").digest("hex");

      expect(digest).toBe(expected);
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);

      await fs.rm(workDir, { recursive: true, force: true });
    });
  });
});
