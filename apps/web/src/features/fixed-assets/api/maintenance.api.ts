import type { CompleteFaMaintenanceDto, FaMaintenanceResponseDto, ScheduleFaMaintenanceDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — thin wrapper over
 * `MaintenanceController`
 * (`packages/server/src/domains/fixed-assets/api/maintenance.controller.ts`,
 * base `/api/v1/fixed-assets/maintenance`, tag `fixed-assets-maintenance`).
 * ONE shared `fixed-assets:maintenance:manage` permission gates ALL 3
 * routes, including both GETs — confirmed by reading the controller
 * directly, no separate `:view` split.
 *
 * **Zero codegen gaps on the request side, one absorbed-for-free response
 * gap — checked directly against BOTH the zod-inferred types
 * (`packages/contracts/src/domains/fixed-assets/maintenance.schema.ts`) AND
 * the raw `openapi-types.ts` shape.** The raw generated
 * `FaMaintenanceResponseDto` degrades `costExpenseVoucherId` to
 * `Record<string, never> | null` (the same reflection gap `transfers.api.ts`'s
 * own doc comment documents) — absorbed for free by using the zod-inferred
 * type directly as this file's read-return type. Both `ScheduleFaMaintenanceDto`/
 * `CompleteFaMaintenanceDto` generate cleanly on the request side (the zod
 * type's `T | undefined` on every optional field is structurally assignable
 * to the raw type's `T | null | undefined`), so `scheduleMaintenance()`/
 * `completeMaintenance()` below pass `dto` straight through, no cast.
 *
 * **`schedule()` immediately flips `fa_asset.status` to
 * `'UNDER_MAINTENANCE'`** — confirmed by reading `MaintenanceService.schedule()`
 * directly, even for a `PLANNED` event that hasn't started yet (the
 * controller's own doc comment states this is deliberate: "even a
 * scheduled-but-not-started event marks the asset unavailable").
 * `maintenance-panel.tsx`'s own "Schedule maintenance" dialog states this
 * plainly so a user isn't surprised the asset becomes unavailable
 * immediately, and the parent asset detail page's status badge reflects it
 * live once the mutation's cache invalidation lands.
 *
 * **`complete()` UNCONDITIONALLY force-sets `fa_asset.status` back to
 * `'ACTIVE'`, regardless of what status the asset carried before/during
 * maintenance** — confirmed by reading `complete()` directly, a real, honest
 * quirk (not a bug this part works around).
 *
 * **`complete()`'s idempotency guard is a real `422`, not a `409`** —
 * confirmed by reading `maintenance.service.ts:80-83` directly:
 * `ValidationException` (`httpStatus = 422`), message exactly
 * `` `fa_maintenance ${maintenanceId} is already complete (done_on already set)` ``
 * when `maintenance.doneOn` is already set. Surfaced verbatim via
 * `ApiError.message`.
 *
 * **A real, previously-unhandled backend gap found and fixed during this
 * part's own live verification, not predicted by this part's own task
 * brief**: `costExpenseVoucherId` is never existence-checked at the
 * DTO/service layer (`CompleteFaMaintenanceDto` only carries `@IsUUID()`),
 * but `fa_maintenance.cost_expense_voucher_id` IS a real FK to `exp_voucher`
 * — a syntactically-valid but non-existent id previously reached the caller
 * as a raw, unhandled `500` (live-confirmed: `POST .../complete` with a
 * plausible-but-fake uuid genuinely 500'd before this part's own fix).
 * `packages/server/src/domains/fixed-assets/application/maintenance.service.ts`'s
 * `complete()` now catches the real Postgres `23503` foreign_key_violation
 * and throws a clean `ValidationException` naming the bad id instead — the
 * same catch-the-real-Postgres-code-and-translate discipline Part 1's own
 * `assets.service.ts` 409 fixes already established, just for a different
 * SQLSTATE. `completeMaintenance()` below surfaces this verbatim via
 * `ApiError.message`, same as every other clean error in this file.
 *
 * **`GET /maintenance/:id` (single-event detail) is deliberately NOT wrapped
 * here** — same judgment call as `transfers.api.ts`'s own doc comment:
 * `listMaintenanceByAsset()`'s rows already carry every field
 * `maintenance-panel.tsx` needs, so a second fetch for one event in
 * isolation has no real caller in this part's own scope.
 */
export async function listMaintenanceByAsset(assetId: string): Promise<FaMaintenanceResponseDto[]> {
  return unwrapApiResult<FaMaintenanceResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/maintenance/asset/{assetId}", { params: { path: { assetId } } }),
  );
}

export async function scheduleMaintenance(dto: ScheduleFaMaintenanceDto): Promise<FaMaintenanceResponseDto> {
  return unwrapApiResult<FaMaintenanceResponseDto>(await apiClient.POST("/api/v1/fixed-assets/maintenance", { body: dto }));
}

export async function completeMaintenance(id: string, dto: CompleteFaMaintenanceDto): Promise<FaMaintenanceResponseDto> {
  return unwrapApiResult<FaMaintenanceResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/maintenance/{id}/complete", { params: { path: { id } }, body: dto }),
  );
}
