import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 24 (Licensing, Module 21) — hand-typed request/response
 * shapes, NOT sourced from `@klickit/contracts`. Confirmed by reading
 * `packages/server/src/licensing/api/license-status.controller.ts` directly:
 * no controller anywhere under `licensing/` uses `@ApiResponse`/
 * `@ApiOkResponse`/`@ApiCreatedResponse`, so every one of these 3 routes'
 * generated `openapi-types.ts` entries carries `responses: { 200: { content?:
 * never } }` — zero usable response schema, a first for this whole Phase 6
 * effort (every prior module had at least partial usable codegen). The path
 * KEYS themselves ("/api/v1/license/status" etc.) do exist in `paths`, so
 * `apiClient.GET(...)` still resolves/compiles against them — only the
 * response `data` type is untyped (`never`/`unknown`), which is exactly what
 * `unwrapApiResult<T>()`'s own explicit `<T>` type argument is for.
 *
 * One exception: `LicenseStatusController_apiLog`'s OPERATION-level
 * `parameters.query` (distinct from the path-item-level `parameters`, which
 * shows `query?: never`) genuinely IS typed — `{ page: string; pageSize:
 * string }`, both required strings — apparently NestJS/Swagger's reflection
 * picked up the two `@Query("page")`/`@Query("pageSize")` handler params
 * despite no explicit `@ApiQuery` decorator. Real, usable, and used below.
 */

export type LicenseState = "PROVISIONED" | "ACTIVE" | "GRACE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED";

/** Mirrors `LicenseStatusView` (`packages/server/src/licensing/application/license-api.service.ts:56-66`) field-for-field — a plain TS interface server-side, no Swagger decorators at all. */
export interface LicenseStatusView {
  schoolId: string;
  plan: string;
  features: string[];
  validFrom: string;
  validTo: string;
  graceDays: number;
  state: LicenseState;
  verifiedAt: string | null;
  stateChangedAt: string | null;
}

export type ApiCallDirection = "IN" | "OUT";

/** Mirrors `ApiCallLogEntity` (`packages/server/src/licensing/domain/api-call-log.entity.ts:21-40`). `at` is the real event timestamp — display THIS, not `createdAt` (both exist on the row; they're only ever the same instant for a synchronously-logged call, but `at` is the documented source of truth). */
export interface ApiCallLogEntity {
  id: string;
  createdAt: string;
  direction: ApiCallDirection;
  endpoint: string;
  requestBody: unknown | null;
  responseBody: unknown | null;
  callerKeyId: string | null;
  at: string;
}

/** Mirrors `ApiCallLogPage` (`packages/server/src/licensing/api/license-status.controller.ts:10-13`). */
export interface ApiCallLogPage {
  items: ApiCallLogEntity[];
  total: number;
}

export type UpdateNoticeUrgency = "NORMAL" | "SECURITY";
export type UpdateNoticeDecision = "PENDING" | "SCHEDULED" | "APPLIED" | "DECLINED";

/**
 * Mirrors `UpdateNoticeEntity` (`packages/server/src/licensing/domain/update-notice.entity.ts:33-54`).
 * `releaseVersion` is the real announced version string (the wire/DB column
 * is genuinely named this, not `version`) — this entity ALSO inherits an
 * unrelated `version: number` optimistic-lock counter from
 * `MutableBaseEntity`, deliberately NOT declared here since this interface
 * only models the fields this screen actually renders.
 */
export interface UpdateNoticeEntity {
  id: string;
  createdAt: string;
  releaseVersion: string;
  notes: string;
  urgency: UpdateNoticeUrgency;
  mandatoryBy: string | null;
  receivedAt: string;
  appliedAt: string | null;
  decision: UpdateNoticeDecision;
}

/** `GET /license/status` — `license:status:view`. A 404 (`NotFoundException("License", "current")`) is the real, confirmed response when no `license.license` row has ever been provisioned — `<QueryBoundary>`'s generic "error" state renders that reasonably; no special-casing needed. */
export async function getLicenseStatus(): Promise<LicenseStatusView> {
  return unwrapApiResult<LicenseStatusView>(await apiClient.GET("/api/v1/license/status"));
}

export interface ApiCallLogParams {
  page?: number;
  pageSize?: number;
}

/** `GET /license/api-log?page=&pageSize=` — both RAW STRINGS on the wire, `Number()`-coerced server-side with no `isNaN`/range guard (a known, minor backend quirk) — this wrapper always sends well-formed numeric strings, defaulting to the same `page=1`/`pageSize=50` the server itself defaults to when omitted. */
export async function getApiCallLog(params: ApiCallLogParams = {}): Promise<ApiCallLogPage> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  return unwrapApiResult<ApiCallLogPage>(
    await apiClient.GET("/api/v1/license/api-log", {
      params: { query: { page: String(page), pageSize: String(pageSize) } },
    }),
  );
}

/** `GET /license/update-notices` — no pagination params on this route (default limit 50 server-side). */
export async function getUpdateNotices(): Promise<UpdateNoticeEntity[]> {
  return unwrapApiResult<UpdateNoticeEntity[]>(await apiClient.GET("/api/v1/license/update-notices"));
}
