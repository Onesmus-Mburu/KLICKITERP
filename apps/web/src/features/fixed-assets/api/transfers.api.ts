import type { CreateFaTransferDto, FaTransferResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — thin wrapper over
 * `TransfersController`
 * (`packages/server/src/domains/fixed-assets/api/transfers.controller.ts`,
 * base `/api/v1/fixed-assets/transfers`, tag `fixed-assets-transfers`). ONE
 * shared `fixed-assets:transfer:create` permission gates ALL 4 routes,
 * including both GETs — confirmed by reading the controller directly, no
 * separate `:view`/`:decide` split exists here.
 *
 * **Zero codegen gaps on either the request or response side — checked
 * directly against BOTH the zod-inferred types
 * (`packages/contracts/src/domains/fixed-assets/transfer.schema.ts`) AND the
 * raw `openapi-types.ts` shape, not assumed.** The raw generated
 * `FaTransferResponseDto` DOES degrade `fromCustodianUserId`/
 * `toCustodianUserId`/`ackBy` to `Record<string, never> | null` (the same
 * nullable-without-an-explicit-`type:`-hint reflection gap `assets.api.ts`'s
 * own doc comment documents for 9 different fields) — but the zod-inferred
 * type used directly below as this file's read-return type gets every one of
 * these right (`z.string().nullable()`), absorbing the gap for free, the
 * same `employees.api.ts`/`assets.api.ts` precedent. Unlike `assets.api.ts`,
 * there is no REQUEST-body gap on `CreateFaTransferDto` either — its one
 * optional field (`toCustodianUserId`) generates as plain `string | null |
 * undefined` on the raw shape and `string | undefined` on the zod-inferred
 * one, and the latter is structurally assignable to the former, so
 * `createTransfer()` below passes `dto` straight through with no
 * `as unknown as` cast anywhere in this file.
 *
 * **No approval chain exists for transfers at all** — confirmed by reading
 * `TransfersService` directly: no `status` field, no `appr_instance`
 * submission anywhere. `create()` is a single, immediate, direct action:
 * it captures the asset's CURRENT `location`/`custodianUserId` as this new
 * row's `fromLocation`/`fromCustodianUserId`, then overwrites the asset's own
 * live `location`/`custodianUserId` with the supplied `to*` values, both in
 * the same call — `transfer-panel.tsx`'s own "New transfer" dialog copy
 * states this plainly (no submit-then-decide framing, unlike every other
 * multi-step workflow in this app).
 *
 * **BR-FA-02** (a disposed/written-off asset cannot receive further
 * transactions, a real `BEFORE INSERT` DB trigger,
 * `trg_fa_transfer_no_txn_after_disposal`) is never pre-validated
 * client-side here — `transfer-panel.tsx` disables its own "New transfer"
 * trigger once `asset.status` is `DISPOSED`/`WRITTEN_OFF` (not reachable yet
 * this slice, Part 4/Disposals will make it reachable) as a UX nicety, but
 * the real enforcement is entirely server-side.
 *
 * **`acknowledge()` idempotency guard is a real `422`, not a `409`** —
 * confirmed by reading `transfers.service.ts:56-62` directly:
 * `ValidationException` (`httpStatus = 422`), message exactly
 * `` `fa_transfer ${transferId} has already been acknowledged` `` when
 * `transfer.ackBy` is already set. Surfaced verbatim via `ApiError.message`
 * by every caller.
 *
 * **`GET /transfers/:id` (single-transfer detail) is deliberately NOT
 * wrapped here** — a judgment call, per this part's own task brief's
 * explicit permission ("your call"): `listTransfersByAsset()`'s own rows
 * already carry every field `transfer-panel.tsx` needs, so a second fetch
 * for one transfer in isolation has no real caller in this part's own scope.
 * Skipped, not forgotten — add it if a future part needs a genuinely
 * out-of-list single-transfer view.
 */
export async function listTransfersByAsset(assetId: string): Promise<FaTransferResponseDto[]> {
  return unwrapApiResult<FaTransferResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/transfers/asset/{assetId}", { params: { path: { assetId } } }),
  );
}

export async function createTransfer(dto: CreateFaTransferDto): Promise<FaTransferResponseDto> {
  return unwrapApiResult<FaTransferResponseDto>(await apiClient.POST("/api/v1/fixed-assets/transfers", { body: dto }));
}

/** No request body — see this file's own doc comment for the real `422` idempotency guard on an already-acknowledged transfer. */
export async function acknowledgeTransfer(id: string): Promise<FaTransferResponseDto> {
  return unwrapApiResult<FaTransferResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/transfers/{id}/acknowledge", { params: { path: { id } } }),
  );
}
