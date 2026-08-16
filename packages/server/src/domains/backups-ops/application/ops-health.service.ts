import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { BkpBackupRunRepository } from "../infrastructure/bkp-backup-run.repository";
import { BackupStorageClient } from "../infrastructure/backup-storage-client";

export interface OpsCheckResult {
  ok: boolean;
  detail?: string;
  error?: string;
}

export interface OpsDatabaseCheckResult extends OpsCheckResult {
  sizeBytes?: number;
}

export interface OpsDiskCheckResult {
  available: boolean;
  totalBytes?: number;
  freeBytes?: number;
  usedPercent?: number;
  note?: string;
}

export interface OpsLastBackupResult {
  found: boolean;
  runId?: string;
  startedAt?: string;
  status?: string;
  ageHours?: number;
}

export interface OpsHealthSummary {
  database: OpsDatabaseCheckResult;
  redis: OpsCheckResult;
  minio: OpsCheckResult;
  disk: OpsDiskCheckResult;
  lastBackup: OpsLastBackupResult;
  appVersion: string;
  licenseState: string;
  queueDepths: { note: string };
  logLevel: { current: string; settable: boolean; note: string };
  generatedAt: string;
}

/**
 * Module 20 (Backups/Ops), FR-BKP-005.1 — `/ops` page data. Every sub-check
 * is written to catch its OWN error and return a `{ok:false, error}` result
 * rather than throw, so `getHealthSummary()` never crashes from one bad
 * check — a DB outage still lets Redis/MinIO/disk/last-backup report
 * normally (the task's own "graceful degradation" requirement).
 *
 * **Honest scope boundaries** (documented per-field below, not fabricated):
 * - `licenseState` (Phase 6 Slice 25 fix — Licensing shipped in Slice 24,
 *   this stub is now stale) reads the REAL state via a raw SQL query against
 *   `license.v_state` — the exact same mechanism `shared/rbac/
 *   license-state.guard.ts` itself already uses to read license state from
 *   outside the `licensing` module. This is NOT a TypeScript import:
 *   `packages/config/eslint/module-deps.json` defines `licensing` with
 *   `"importableBy": []` — no module, including this one, is allowed to
 *   import any symbol from `licensing/` (CI-enforced via ESLint
 *   `import/no-restricted-paths`). `license.v_state` is a narrow read-only
 *   view `kfe_app` already has real `SELECT` access to (migration `0190`,
 *   confirmed live in Slice 24). A missing/zero-row result (this dev
 *   environment currently has zero rows in `license.license`) falls back to
 *   `"NOT_PROVISIONED"` — the correct, honest value, not an error.
 * - `queueDepths`/DLQ counts are reported as N/A — no BullMQ queue
 *   infrastructure is wired up anywhere in this codebase (the worker app was
 *   never built out as real infrastructure), so fabricating numbers here
 *   would be actively misleading.
 * - `logLevel` reflects the `LOG_LEVEL` env var only, `settable: false` —
 *   this codebase has no structured `Logger` abstraction with a
 *   runtime-mutable level (no pino/winston wrapper anywhere in `src/`), so a
 *   real "switch" control has nothing to call; documented here rather than
 *   faking a working toggle.
 * - `disk` uses `fs.promises.statfs` (Node 18.15+/19.6+, POSIX-oriented) —
 *   wrapped in its own try/catch; on a platform/Node build where it's
 *   unavailable or errors (this dev environment is Windows, where libuv's
 *   statfs support is inconsistent across Node builds), this returns
 *   `{available:false, note:...}` rather than crashing the whole summary.
 */
@Injectable()
export class OpsHealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly backupStorageClient: BackupStorageClient,
    private readonly backupRunRepository: BkpBackupRunRepository,
    private readonly config: AppConfigService,
  ) {}

  async getHealthSummary(): Promise<OpsHealthSummary> {
    const [database, redis, minio, disk, lastBackup, licenseState] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMinio(),
      this.checkDisk(),
      this.checkLastBackup(),
      this.checkLicenseState(),
    ]);

    return {
      database,
      redis,
      minio,
      disk,
      lastBackup,
      appVersion: this.readAppVersion(),
      licenseState,
      queueDepths: { note: "N/A — no queue infrastructure (BullMQ) is wired up anywhere in this codebase yet" },
      logLevel: {
        current: process.env.LOG_LEVEL ?? "info",
        settable: false,
        note: "No structured Logger abstraction with a runtime-mutable level exists yet in this codebase — reflects the LOG_LEVEL env var only",
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<OpsDatabaseCheckResult> {
    try {
      await this.dataSource.query("SELECT 1");
      const rows: { size: string }[] = await this.dataSource.query("SELECT pg_database_size(current_database())::text AS size");
      return { ok: true, sizeBytes: Number(rows[0]?.size ?? 0) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<OpsCheckResult> {
    try {
      const pong = await this.redis.ping();
      return { ok: pong === "PONG", detail: pong };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private async checkMinio(): Promise<OpsCheckResult> {
    try {
      await this.backupStorageClient.listObjects(this.config.minioBucketDefault);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private async checkDisk(): Promise<OpsDiskCheckResult> {
    try {
      if (typeof fs.statfs !== "function") {
        return { available: false, note: "fs.statfs is not available in this Node build/platform" };
      }
      const stats = await fs.statfs(this.config.backupLocalDir).catch(() => fs.statfs(process.cwd()));
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
      return { available: true, totalBytes, freeBytes, usedPercent };
    } catch (error) {
      return {
        available: false,
        note: `Disk usage probe failed (Windows dev environments can lack full fs.statfs support): ${(error as Error).message}`,
      };
    }
  }

  /**
   * Phase 6 Slice 25 fix — reads the real license state via raw SQL against
   * `license.v_state` (never a TS import — see this class's own doc comment
   * above for why). Mirrors `checkDatabase()`'s own raw-`this.dataSource.query()`
   * pattern exactly. A zero-row result (no license ever provisioned) or any
   * query failure both fall back to `"NOT_PROVISIONED"`/an `ERROR:` string
   * respectively — this method never throws, keeping `getHealthSummary()`'s
   * own "one bad check never crashes the whole summary" guarantee intact.
   */
  private async checkLicenseState(): Promise<string> {
    try {
      const rows: { state: string }[] = await this.dataSource.query("SELECT state FROM license.v_state");
      return rows[0]?.state ?? "NOT_PROVISIONED";
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  }

  private async checkLastBackup(): Promise<OpsLastBackupResult> {
    try {
      const latest = await this.backupRunRepository.findLatest();
      if (!latest) {
        return { found: false };
      }
      const ageHours = (Date.now() - latest.startedAt.getTime()) / (60 * 60 * 1000);
      return {
        found: true,
        runId: latest.id,
        startedAt: latest.startedAt.toISOString(),
        status: latest.status,
        ageHours: Math.round(ageHours * 100) / 100,
      };
    } catch {
      return { found: false };
    }
  }

  /** Reads the monorepo ROOT `package.json`'s `version` at runtime (not a compile-time import — the root package.json sits outside this package's `tsconfig.json` `rootDir` boundary). Returns `"unknown"` on any failure rather than throwing. */
  private readAppVersion(): string {
    try {
      const pkgPath = path.resolve(__dirname, "../../../../../../package.json");
      const raw = readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as { version?: string };
      return pkg.version ?? "unknown";
    } catch {
      return "unknown";
    }
  }
}
