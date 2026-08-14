import type { CreateStoreDto, StoreResponseDto, UpdateStoreDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — thin wrapper
 * over `StoresController`
 * (`packages/server/src/domains/inventory/api/stores.controller.ts`, base
 * `/api/v1/inventory/stores`) — a single shared `inventory:store:manage`
 * permission gates ALL 4 routes, including both GETs (confirmed by reading
 * the controller directly, 61 lines) — same "no separate view permission"
 * shape Categories establishes, unlike Items.
 *
 * `CreateStoreDto`/`UpdateStoreDto`/`StoreResponseDto` (`packages/contracts/src/domains/inventory/store.schema.ts`)
 * have NO class-name collision anywhere else in `packages/server/src`
 * (grep-confirmed) and are flatly exported from `@klickit/contracts`'s root
 * barrel — imported directly above, unlike `categories.api.ts`'s own
 * namespaced workaround. Checked every field of both request DTOs directly
 * against `packages/contracts/src/generated/openapi-types.ts`
 * (`CreateStoreDto`/`UpdateStoreDto`) and against the real class-validator
 * source (`store.dto.ts`) — **zero codegen gaps found**: no nullable-field
 * degradation, no Swagger `default` dropping a `?`, every field matches the
 * real, narrow shape exactly. `createStore()`/`updateStore()` below pass
 * their `dto` straight through with no cast, matching `journals.api.ts`'s
 * own "zero request-body gaps" precedent.
 *
 * **No dedicated activate/deactivate routes exist for stores** (unlike
 * Accounts/Cost Centers/Suppliers) — `isActive` is a plain field on
 * `UpdateStoreDto`, so decommissioning a store is just `updateStore(id,
 * {isActive: false})`, confirmed by reading `StoresController.update()`
 * directly (no separate `.../deactivate` route exists at all).
 *
 * The one real codegen gap is the now-familiar required-vs-optional
 * query-param quirk: `StoresController_list`'s generated `isActive` query
 * param is a required (non-optional) `string`, even though the real
 * controller (`@Query("isActive") isActive?: string`) treats it as
 * genuinely optional. `listStores()` builds the query object CONDITIONALLY
 * (omitted entirely when `isActive` is `undefined`), matching every other
 * `*.api.ts` file's own established fix for this exact class of gap —
 * confirmed by reading `StoresController.list()`'s own `isActive === undefined
 * ? {} : {isActive: isActive === "true"}` body that an empty-string value
 * would NOT be equivalent to an absent key.
 */
interface StoresListQueryShape {
  isActive?: string;
}

export async function listStores(isActive?: boolean): Promise<StoreResponseDto[]> {
  const query: StoresListQueryShape = {};
  if (isActive !== undefined) query.isActive = String(isActive);
  return unwrapApiResult<StoreResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/stores", { params: { query: query as unknown as Required<StoresListQueryShape> } }),
  );
}

export async function getStore(id: string): Promise<StoreResponseDto> {
  return unwrapApiResult<StoreResponseDto>(await apiClient.GET("/api/v1/inventory/stores/{id}", { params: { path: { id } } }));
}

/** Globally-unique `name` — a duplicate-name create attempt is rejected and surfaced as a real `ApiError`. The real rejection is a raw `500 INTERNAL_ERROR` (confirmed live: `duplicate key value violates unique constraint "uq_inv_store_name"` leaking verbatim), not a clean 409/422 — see `categories.api.ts`'s own doc comment for the full, shared root cause across Categories/Stores/Items (no unique-constraint catch anywhere in `StoresService.create()`, no generic DB-error-code mapping in `AllExceptionsFilter`). Out of scope to fix here (`packages/server`, frontend-only part). */
export async function createStore(dto: CreateStoreDto): Promise<StoreResponseDto> {
  return unwrapApiResult<StoreResponseDto>(await apiClient.POST("/api/v1/inventory/stores", { body: dto }));
}

/** `isActive: false` is the only decommission path — no delete route exists. */
export async function updateStore(id: string, dto: UpdateStoreDto): Promise<StoreResponseDto> {
  return unwrapApiResult<StoreResponseDto>(await apiClient.PATCH("/api/v1/inventory/stores/{id}", { params: { path: { id } }, body: dto }));
}
