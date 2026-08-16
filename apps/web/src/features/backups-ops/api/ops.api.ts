import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — thin wrapper over
 * `OpsController` (`packages/server/src/domains/backups-ops/api/ops.controller.ts`,
 * base `/api/v1/ops`). `OpsHealthResponseDto` is entirely `type: Object`
 * sub-shapes server-side (`ops-health.dto.ts`'s own doc comment: "nested
 * checks stay `type: Object`... proportionate to how loosely-shaped each
 * check's optional fields are") — the SAME class of codegen gap
 * `backups.api.ts` documents for `BackupRunResponseDto`. Hand-typed directly
 * from `OpsHealthSummary` (`application/ops-health.service.ts`), not sourced
 * from `@klickit/contracts`.
 *
 * **Not `@ExemptFromLicenseGuard()`** (a real, if minor, inconsistency with
 * `BackupsController`'s own class-level exemption — confirmed by reading
 * `OpsController` directly, no such decorator present) — so if this
 * instance's license ever reaches `DEACTIVATED`, this one query hits a real
 * `403 LICENSE_DEACTIVATED` from the global `LicenseStateGuard` before the
 * controller ever runs, unlike every route on `BackupsController` which stays
 * reachable in any license state. `<QueryBoundary>`'s generic
 * permission-denied state (keyed off `status === 403`, not license-state
 * specifically) renders that reasonably; no special-case messaging added
 * here for a state this environment's own license was never put into.
 */

export interface OpsDatabaseCheckResult {
  ok: boolean;
  sizeBytes?: number;
  error?: string;
}

export interface OpsCheckResult {
  ok: boolean;
  detail?: string;
  error?: string;
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

/** `GET /ops/health` — `ops:health:view`. Real service healthchecks (DB/Redis/MinIO), disk %, DB size, last-backup badge, app version, real license state (via `license.v_state`, Phase 6 Slice 25 backend fix), log-level, queue depths (permanent N/A — no queue infra exists). */
export async function getOpsHealth(): Promise<OpsHealthSummary> {
  return unwrapApiResult<OpsHealthSummary>(await apiClient.GET("/api/v1/ops/health"));
}
