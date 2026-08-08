import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import * as path from "node:path";
import { execFile, ExecFileException } from "node:child_process";

/** Discrete connection params for `pg_dump`/`pg_restore` — never string-concatenated into a shell command (see `runExecFile`'s own doc comment). */
export interface PgConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** Distinct from `BackupExecutionError` — the external binary (`pg_dump`/`pg_restore`/`tar`) itself isn't reachable on `PATH`, not "it ran and failed." Callers should surface this with an install/PATH hint, not a generic error. */
export class BackupToolNotFoundError extends Error {
  constructor(readonly command: string) {
    super(`"${command}" not found on PATH — install PostgreSQL client tools (pg_dump/pg_restore) and/or tar, and ensure they are reachable`);
    this.name = "BackupToolNotFoundError";
  }
}

/** The external binary ran but exited non-zero — distinct from `BackupToolNotFoundError` (see that class's own doc comment). Carries `stderr`/`exitCode` for diagnostics. */
export class BackupExecutionError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`"${command}" failed${exitCode !== null ? ` (exit code ${exitCode})` : ""}: ${stderr.trim().slice(0, 1000) || "no stderr output"}`);
    this.name = "BackupExecutionError";
  }
}

const MAX_BUFFER_BYTES = 200 * 1024 * 1024;

/**
 * Wraps `child_process.execFile` (NOT `exec`) in a Promise — connection
 * params/paths are always passed as discrete argv elements (or, for the
 * Postgres password, an env var), never string-concatenated into a shell
 * command, so nothing here is vulnerable to shell injection regardless of
 * what a caller passes as a database name/path. Distinguishes "the tool
 * itself isn't installed" (`ENOENT` -> `BackupToolNotFoundError`, a distinct,
 * actionable error) from "the tool ran and failed" (`BackupExecutionError`,
 * carrying real stderr) — this environment likely doesn't have `pg_dump`/
 * `pg_restore`/`tar` installed (docs/phase-5/PROGRESS.md "Environment
 * status"), so every caller of this module must fail gracefully and
 * informatively here, never crash with an opaque Node error.
 */
function runExecFile(command: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args as string[],
      { maxBuffer: MAX_BUFFER_BYTES, env: env ?? process.env },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (!error) {
          resolve({ stdout, stderr });
          return;
        }
        if (error.code === "ENOENT") {
          reject(new BackupToolNotFoundError(command));
          return;
        }
        const exitCode = typeof error.code === "number" ? error.code : null;
        reject(new BackupExecutionError(command, exitCode, stderr || error.message));
      },
    );
  });
}

/**
 * `pg_dump -Fc` (custom format — required for `pg_restore --clean --if-exists`
 * later, and the only format that supports selective/parallel restore).
 * `PGPASSWORD` is passed as an env var, never an argv element (the standard
 * libpq convention — argv would leak the password via `ps`/process listing).
 */
export async function dumpDatabase(config: PgConnectionConfig, outputPath: string): Promise<{ path: string; sizeBytes: number }> {
  await runExecFile(
    "pg_dump",
    ["-Fc", "-h", config.host, "-p", String(config.port), "-U", config.user, "-d", config.database, "-f", outputPath],
    { ...process.env, PGPASSWORD: config.password },
  );
  const stat = await fs.stat(outputPath);
  return { path: outputPath, sizeBytes: stat.size };
}

/**
 * `pg_restore --clean --if-exists` against an already-reachable target
 * (provisioning the target itself — e.g. a scratch container — is out of
 * this function's/this module's scope, see `RestoreVerificationService`'s
 * own doc comment). `--clean --if-exists` drops existing objects before
 * recreating them so a restore-verify run against a previously-used scratch
 * target doesn't fail on "already exists" errors.
 */
export async function restoreDatabase(config: PgConnectionConfig, dumpPath: string): Promise<void> {
  await runExecFile(
    "pg_restore",
    ["--clean", "--if-exists", "-h", config.host, "-p", String(config.port), "-U", config.user, "-d", config.database, dumpPath],
    { ...process.env, PGPASSWORD: config.password },
  );
}

/**
 * Shells out to `tar` (present on every real deployment target — Linux/
 * macOS natively, Windows 10+ ships `tar.exe`/bsdtar) rather than adding a
 * new npm archiving dependency, same "external tool, gracefully degrade if
 * missing" standard `dumpDatabase`/`restoreDatabase` set. All `sourcePaths`
 * must share the same immediate parent directory (true for this module's
 * own call site — `BackupOrchestratorService.runBackup()` stages everything
 * under one temp work dir) — `tar -C <sharedParent> <relativeNames>` keeps
 * the archive's internal paths relative/clean instead of embedding the
 * host's absolute temp-dir path.
 */
export async function createTarArchive(sourcePaths: readonly string[], outputPath: string): Promise<{ path: string; sizeBytes: number }> {
  if (sourcePaths.length === 0) {
    throw new Error("createTarArchive requires at least one source path");
  }
  const baseDir = path.dirname(sourcePaths[0]);
  const relativeNames = sourcePaths.map((p) => path.relative(baseDir, p));
  await runExecFile("tar", ["-cf", outputPath, "-C", baseDir, ...relativeNames]);
  const stat = await fs.stat(outputPath);
  return { path: outputPath, sizeBytes: stat.size };
}

/** The inverse of `createTarArchive` — used by `RestoreVerificationService` to unpack a decrypted archive back into `db.dump`/mirrored files/env snapshot before restoring. */
export async function extractTarArchive(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  await runExecFile("tar", ["-xf", archivePath, "-C", destDir]);
}

/** Streaming SHA-256 (no external process — Node's built-in `crypto`) so large archives never need to be fully buffered in memory just to hash them. */
export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
