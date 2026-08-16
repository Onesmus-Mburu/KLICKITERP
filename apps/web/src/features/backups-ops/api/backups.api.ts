import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — thin wrapper over
 * `BackupsController` (`packages/server/src/domains/backups-ops/api/backups.controller.ts`,
 * base `/api/v1/backups`).
 *
 * **Request bodies ARE cleanly typed by codegen** (`RunBackupDto`/
 * `VerifyRestoreDto`'s `target` — checked directly against
 * `packages/contracts/src/generated/openapi-types.ts`, neither carries a
 * stripped-optionality or `nullable`-collapse gap), so those two go straight
 * through `apiClient.POST(...)` with no cast. **Response bodies do NOT** —
 * `BackupRunResponseDto`/`RestoreRunResponseDto` mix `nullable: true` with no
 * explicit `type:` on several fields (`finishedAt`, `sizeBytes`, `sha256`,
 * `error`, `notes`) and genuinely arbitrary `type: Object`/`type: [Object]`
 * shapes (`destinations`, `manifest`, `fromManifest`) — the SAME class of gap
 * `features/licensing/api/license.api.ts` already documented for its own
 * module: NestJS/Swagger's reflection can't infer a TS type from a
 * `string | null` return type, so `openapi-typescript` emits an ambiguous
 * `Record<string, never> | null` placeholder instead. Every response
 * interface below is therefore hand-typed directly from the real backend
 * TypeScript source (`bkp-backup-run.entity.ts`/`bkp-restore-run.entity.ts`/
 * `ops-health.service.ts`), not sourced from `@klickit/contracts`, mirroring
 * `license.api.ts`'s own established precedent for this exact class of gap.
 */

export type BackupRunKind = "SCHEDULED" | "MANUAL" | "PRE_UPDATE";
export const BACKUP_RUN_KINDS: readonly BackupRunKind[] = ["SCHEDULED", "MANUAL", "PRE_UPDATE"];

export type BackupRunStatus = "RUNNING" | "OK" | "FAILED";
export const BACKUP_RUN_STATUSES: readonly BackupRunStatus[] = ["RUNNING", "OK", "FAILED"];

export type BackupDestinationType = "LOCAL" | "MINIO" | "OFFSITE_S3";

/** Mirrors `BackupDestinationResult` (`domain/bkp-backup-run.entity.ts`) — one fan-out attempt record. */
export interface BackupDestinationResult {
  type: BackupDestinationType;
  path?: string;
  bucket?: string;
  key?: string;
  ok: boolean;
  error?: string;
}

/** Mirrors `BackupManifest` (`domain/bkp-backup-run.entity.ts`) — populated only when `status==='OK'`. */
export interface BackupManifest {
  sha256: string;
  sizeBytes: number;
  dbDumpSizeBytes: number;
  filesTarSizeBytes: number;
  createdAt: string;
  kind: BackupRunKind;
  tableRowCounts: Record<string, number>;
  passphraseCheck: string;
}

/** Mirrors `BackupRunResponseDto` (`api/dto/backup-run.dto.ts`). */
export interface BackupRunResponseDto {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  kind: BackupRunKind;
  status: BackupRunStatus;
  sizeBytes: string | null;
  sha256: string | null;
  destinations: BackupDestinationResult[];
  manifest: BackupManifest | null;
  error: string | null;
  createdAt: string;
}

export interface ListBackupRunsMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ListBackupRunsResponse {
  items: BackupRunResponseDto[];
  meta: ListBackupRunsMeta;
}

export interface VerifyRestoreTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** Mirrors `RestoreRunResponseDto` (`api/dto/restore-run.dto.ts`). */
export interface RestoreRunResponseDto {
  id: string;
  fromManifest: BackupManifest;
  startedAt: string;
  finishedAt: string | null;
  status: BackupRunStatus;
  notes: string | null;
}

export interface PruneBackupsResponse {
  prunedCount: number;
  prunedRunIds: string[];
}

/** `POST /backups/run` — `backups:run:create`. Real, slow (pg_dump + files-bucket mirror + AES-256-GCM encrypt + multi-destination fan-out) — always resolves to a terminal `status: 'OK'|'FAILED'`, never `RUNNING`. */
export async function runBackup(kind: BackupRunKind): Promise<BackupRunResponseDto> {
  return unwrapApiResult<BackupRunResponseDto>(await apiClient.POST("/api/v1/backups/run", { body: { kind } }));
}

export interface ListBackupRunsParams {
  kind?: BackupRunKind;
  status?: BackupRunStatus;
  page?: number;
  pageSize?: number;
}

/** `GET /backups?kind=&status=&page=&pageSize=` — `backups:run:view` (a genuinely separate, narrower permission than `:create`). Real server pagination, defaults `page=1,pageSize=20` server-side. */
export async function listBackupRuns(params: ListBackupRunsParams = {}): Promise<ListBackupRunsResponse> {
  return unwrapApiResult<ListBackupRunsResponse>(
    await apiClient.GET("/api/v1/backups", {
      params: {
        query: {
          ...(params.kind ? { kind: params.kind } : {}),
          ...(params.status ? { status: params.status } : {}),
          ...(params.page ? { page: params.page } : {}),
          ...(params.pageSize ? { pageSize: params.pageSize } : {}),
        },
      },
    }),
  );
}

/** `GET /backups/:id` — `backups:run:view`. */
export async function getBackupRun(id: string): Promise<BackupRunResponseDto> {
  return unwrapApiResult<BackupRunResponseDto>(await apiClient.GET("/api/v1/backups/{id}", { params: { path: { id } } }));
}

/**
 * `POST /backups/:id/verify-restore` — `backups:restore:verify`. `target`
 * must be an ALREADY-REACHABLE Postgres connection — provisioning it is
 * explicitly out of this endpoint's own scope (see `RestoreVerificationService`'s
 * doc comment). Requires the target run's own `status==='OK'` with a real
 * manifest, else a real `ValidationException` (422).
 */
export async function verifyRestore(id: string, target: VerifyRestoreTarget): Promise<RestoreRunResponseDto> {
  return unwrapApiResult<RestoreRunResponseDto>(
    await apiClient.POST("/api/v1/backups/{id}/verify-restore", { params: { path: { id } }, body: { target } }),
  );
}

/** `POST /backups/prune` — `backups:retention:prune`. No body. Real GFS retention (7 daily / 4 weekly / 12 monthly `kind='SCHEDULED'` runs ONLY) — deletes both the pruned runs' destination files/objects AND their `bkp_backup_run` rows, permanently. `MANUAL`/`PRE_UPDATE` runs are never touched. */
export async function pruneBackups(): Promise<PruneBackupsResponse> {
  return unwrapApiResult<PruneBackupsResponse>(await apiClient.POST("/api/v1/backups/prune"));
}
