import type {
  BlacklistSupplierDto,
  CreateSupplierDto,
  SetManualRatingDto,
  SupplierResponseDto,
  UpdateSupplierDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — thin wrapper over
 * `SuppliersController` (`packages/server/src/domains/procurement/api/suppliers.controller.ts`,
 * base `/api/v1/procurement/suppliers`) — `procurement:supplier:view` gates
 * list/search/get, `procurement:supplier:manage` gates create/update,
 * `procurement:supplier:blacklist` gates blacklist/reactivate,
 * `procurement:rating:manage` gates the two ratings routes (confirmed by
 * reading the controller directly, 138 lines).
 *
 * Real, confirmed codegen gaps hit while writing this file (all against
 * `packages/contracts/src/generated/openapi-types.ts`, NOT against
 * `@klickit/contracts`'s own zod-inferred DTOs — those stay correctly typed
 * throughout for every field EXCEPT one, see point 3 below; response-side
 * gaps need no cast anywhere here, per `lib/api-error.ts`'s own doc comment
 * already loosening `unwrapApiResult`'s `data` param to `unknown`):
 *
 * 1. `SuppliersController_list`'s generated query-param type requires
 *    `status` as a plain (non-optional) `string` even though the real
 *    controller (`@Query("status") status?: ProcSupplierStatus`) treats it
 *    as genuinely optional — same class of gap `accounts.api.ts`'s own
 *    `AccountsListQueryShape` doc comment documents. Built CONDITIONALLY
 *    (omitted entirely when absent), not padded with an empty string —
 *    `SuppliersService.list({status: undefined})` and `{status: ""}` are NOT
 *    equivalent (an empty string is not a real `ProcSupplierStatus`, so
 *    padding would silently send a value the backend would then have to
 *    reject or misinterpret).
 * 2. `SuppliersController_search`'s generated query-param type requires BOTH
 *    `q` and `limit` as plain `string`s, even though the real controller
 *    (`@Query("q") q: string, @Query("limit") limit?: string`) only requires
 *    `q` — `limit` is genuinely optional (the search endpoint's own default
 *    page size lives server-side in `SuppliersService.search()`). Same
 *    conditional-query-object fix as point 1.
 * 3. `CreateSupplierDto.paymentTermsDays` — the REQUEST body, not a query
 *    param — degrades to a required (non-optional) `number` in the
 *    generated type, because `create-supplier.dto.ts`'s own
 *    `@ApiPropertyOptional({ default: 30 })` decorator has a Swagger
 *    `default` value, the exact same `openapi-typescript` quirk
 *    `CreateAccountDto.isControl`/`CreateFiscalYearDto.periodCount` already
 *    documented in Slice 17 — even though the real, zod-inferred
 *    `CreateSupplierDto.paymentTermsDays?: number` (and the real
 *    class-validator DTO) correctly mark it optional. Fixed the same way:
 *    `createSupplier()`'s own local `CreateSupplierRequestBody` interface
 *    mirrors the GENERATED (gapped) shape (`paymentTermsDays: number`,
 *    required) — not the real shape — so the interface itself stays
 *    assignable to what `apiClient.POST` expects; the `dto as unknown as
 *    CreateSupplierRequestBody` cast is what bridges the real
 *    (correctly-optional) `dto` value to that gapped-but-call-site-compatible
 *    shape (confirmed correct via a real `pnpm --filter web exec tsc
 *    --noEmit` run, not assumed).
 *
 * A genuine finding in the OPPOSITE direction from every prior slice's own
 * codegen-gap writeup, worth documenting for the next person who hits it:
 * `@klickit/contracts`'s zod-inferred `UpdateSupplierDto`/`CreateSupplierDto`
 * type `tradingName`/`kraPin` as `string | undefined` (no `null` in the
 * union) — the zod mirror script didn't carry over the `nullable: true` set
 * on `create-supplier.dto.ts`/`update-supplier.dto.ts`'s own
 * `@ApiPropertyOptional({..., nullable: true})` decorators. The GENERATED
 * openapi type gets this right (`tradingName?: string | null`) since these
 * two fields' own TS-declared class type is a plain `string` (not a
 * `string | null` union `@nestjs/swagger` reflection can't infer from,
 * unlike `SupplierResponseDto.tradingName!: string | null`, which DOES hit
 * the usual response-side gap). Net effect: the "real" contracts type here
 * is narrower than what the backend actually accepts (confirmed by reading
 * `UpdateSupplierDto`'s `@IsOptional()` class-validator behavior: `null`
 * skips all other validators and passes through). This pass makes the
 * pragmatic, documented call NOT to build null-clearing for
 * `tradingName`/`kraPin` in `edit-supplier-dialog.tsx` (omitting the field
 * when blanked, not sending `null`) — a real, minor, honest gap (see that
 * component's own doc comment), not a `tsc`-forcing reason to touch this
 * file's request-body typing.
 *
 * `UpdateSupplierDto`'s generated request-body shape has ZERO gaps (every
 * field, including `paymentTermsDays`, stays correctly optional — no Swagger
 * `default` on `update-supplier.dto.ts`'s own `paymentTermsDays`) — confirmed
 * directly, so `updateSupplier()` passes its `dto` straight through with no
 * cast, matching `journals.api.ts`'s own "zero request-body gaps found"
 * precedent from Slice 17 Part 2.
 */
interface SuppliersListQueryShape {
  status?: string;
}

interface SuppliersSearchQueryShape {
  q: string;
  limit?: string;
}

/** Mirrors `CreateSupplierDto`'s GENERATED (gapped) shape: `paymentTermsDays` required (not optional) — see this file's own doc comment above. */
interface CreateSupplierRequestBody {
  name: string;
  tradingName?: string | null;
  kraPin?: string | null;
  contacts?: Record<string, unknown>;
  paymentDetails?: Record<string, unknown>;
  categories?: string[];
  paymentTermsDays: number;
}

export type SupplierStatus = "ACTIVE" | "BLACKLISTED" | "INACTIVE";

export async function listSuppliers(status?: SupplierStatus): Promise<SupplierResponseDto[]> {
  const query: SuppliersListQueryShape = {};
  if (status !== undefined) query.status = status;
  return unwrapApiResult<SupplierResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/suppliers", { params: { query: query as unknown as Required<SuppliersListQueryShape> } }),
  );
}

/** Trigram search on `name` (`ix_proc_supplier_name_trgm`) — a separate endpoint from `listSuppliers()`, not a client-side filter over it. */
export async function searchSuppliers(q: string, limit?: number): Promise<SupplierResponseDto[]> {
  const query: SuppliersSearchQueryShape = { q };
  if (limit !== undefined) query.limit = String(limit);
  return unwrapApiResult<SupplierResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/suppliers/search", {
      params: { query: query as unknown as Required<SuppliersSearchQueryShape> },
    }),
  );
}

export async function getSupplier(id: string): Promise<SupplierResponseDto> {
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.GET("/api/v1/procurement/suppliers/{id}", { params: { path: { id } } }),
  );
}

export async function createSupplier(dto: CreateSupplierDto): Promise<SupplierResponseDto> {
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.POST("/api/v1/procurement/suppliers", { body: dto as unknown as CreateSupplierRequestBody }),
  );
}

export async function updateSupplier(id: string, dto: UpdateSupplierDto): Promise<SupplierResponseDto> {
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.PATCH("/api/v1/procurement/suppliers/{id}", { params: { path: { id } }, body: dto }),
  );
}

/** BR-PROC-05: blocks new POs against this supplier. `reason` is required (`BlacklistSupplierDto.reason: string`, `@MinLength(1)`). */
export async function blacklistSupplier(id: string, reason: string): Promise<SupplierResponseDto> {
  const body: BlacklistSupplierDto = { reason };
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.POST("/api/v1/procurement/suppliers/{id}/blacklist", { params: { path: { id } }, body }),
  );
}

export async function reactivateSupplier(id: string): Promise<SupplierResponseDto> {
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.POST("/api/v1/procurement/suppliers/{id}/reactivate", { params: { path: { id } } }),
  );
}

/**
 * FR-PROC-011.1: recomputes `ratingQuality` only, from GRN rejection-rate
 * data — no body. `ratingDelivery` is NEVER touched by this route (a real,
 * permanent backend gap, not a bug — see `supplier-ratings-panel.tsx`'s own
 * doc comment) and stays whatever it already was (typically `null`, forever,
 * for every supplier). When a supplier has zero GRN history, `sumReceivedQty`
 * stays zero server-side and `ratingQuality` is left UNCHANGED (not reset to
 * `null`/`0`) — confirmed by reading `SupplierRatingsService.computeAutoMetrics()`
 * directly, and by live verification (see docs/phase-6/PROGRESS.md's Slice 18
 * Part 1 section).
 */
export async function computeSupplierRating(id: string): Promise<SupplierResponseDto> {
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.POST("/api/v1/procurement/suppliers/{id}/ratings/compute", { params: { path: { id } } }),
  );
}

/** Sets `ratingManual` directly, 1-5 (`SetManualRatingDto.score`, `@Min(1) @Max(5)`). */
export async function setManualRating(id: string, score: number): Promise<SupplierResponseDto> {
  const body: SetManualRatingDto = { score };
  return unwrapApiResult<SupplierResponseDto>(
    await apiClient.POST("/api/v1/procurement/suppliers/{id}/ratings/manual", { params: { path: { id } }, body }),
  );
}
