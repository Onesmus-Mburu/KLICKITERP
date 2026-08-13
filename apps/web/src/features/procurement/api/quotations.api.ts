import type { AwardQuotationDto, CreateQuotationDto, QuotationLineResponseDto, QuotationResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — thin wrapper over
 * `QuotationsController` (`packages/server/src/domains/procurement/api/quotations.controller.ts`,
 * base `/api/v1/procurement/quotations`) — every single route here, INCLUDING
 * the 3 GETs, is gated behind the one bundled permission
 * `procurement:quotation:manage` (confirmed by reading the controller
 * directly, 115 lines — no separate `...:view` code exists for this entity,
 * the same "manage-bundles-view" shape `SuppliersController`'s own
 * `procurement:rating:manage` already established in Part 1).
 *
 * **Checked every field of `CreateQuotationDto`/`AwardQuotationDto`/
 * `QuotationResponseDto`/`QuotationLineResponseDto` directly against
 * `packages/contracts/src/generated/openapi-types.ts` — zero request-body
 * gaps found this time**: none of `CreateQuotationDto`'s optional fields
 * (`validUntil`, `documentFileId`, `terms`) carry a Swagger `default` in
 * `quotation.dto.ts`, so the generated body type stays correctly optional for
 * all of them — `createQuotation()` passes its `dto` straight through with no
 * cast, matching `requisitions.api.ts`'s own "zero request-body gaps"
 * precedent from Part 2.
 *
 * **One genuine query-param finding, but in the OPPOSITE direction from
 * every prior list-query gap in this codebase**: `QuotationsController_list`'s
 * generated `requisitionId` query param is a plain (non-optional) `string` —
 * and this time that's ACCURATE, not a gap. The real controller
 * (`@Query("requisitionId") requisitionId: string`, no `?`) genuinely
 * requires it — `QuotationsService.listByRequisition(requisitionId)` has no
 * "list everything" fallback. `listQuotationsByRequisition()` below therefore
 * takes `requisitionId` as a required positional argument, not an optional
 * filter object the way `listRequisitions()`/`listSuppliers()` do.
 *
 * Response-side gaps (`QuotationResponseDto.validUntil`/`.documentFileId`/
 * `.terms`/`.awardReason` all degrading to `Record<string, never> | null` in
 * the generated type, the same no-`type:-String`-hint-on-a-nullable-field
 * class of bug `lib/api-error.ts` documents for Students) need no cast
 * anywhere here — `unwrapApiResult<T>()`'s `data: unknown` parameter already
 * absorbs them. No `Date`-typed field exists on either response DTO
 * (`quoteDate`/`validUntil` are both plain `z.string()` in
 * `quotation.schema.ts`, not `z.coerce.date()`) — unlike
 * `PurchaseOrderResponseDto.issuedAt` (see `purchase-orders.api.ts`'s own
 * doc comment), no `Date`-vs-string override type is needed here.
 */
export async function listQuotationsByRequisition(requisitionId: string): Promise<QuotationResponseDto[]> {
  return unwrapApiResult<QuotationResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/quotations", { params: { query: { requisitionId } } }),
  );
}

export async function getQuotation(id: string): Promise<QuotationResponseDto> {
  return unwrapApiResult<QuotationResponseDto>(
    await apiClient.GET("/api/v1/procurement/quotations/{id}", { params: { path: { id } } }),
  );
}

export async function getQuotationLines(id: string): Promise<QuotationLineResponseDto[]> {
  return unwrapApiResult<QuotationLineResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/quotations/{id}/lines", { params: { path: { id } } }),
  );
}

/** Captures the quote + every line atomically against an APPROVED requisition — `ProcQuotationLineEntity` is immutable, there's no separate add/update/remove-line route, so `dto.lines` must be complete and correct on this one call. */
export async function createQuotation(dto: CreateQuotationDto): Promise<QuotationResponseDto> {
  return unwrapApiResult<QuotationResponseDto>(await apiClient.POST("/api/v1/procurement/quotations", { body: dto }));
}

/**
 * BR-PROC (implicit): at most one awarded quotation per requisition,
 * enforced by a real DB unique-violation (`uq_proc_quotation_award_p`) caught
 * server-side and surfaced as a 409 — calling this a second time for the same
 * requisition (a different quotation already holds the award) is a real,
 * expected error path, not a hypothetical; callers must handle it explicitly
 * (see `quotation-comparison.tsx`'s own doc comment).
 */
export async function awardQuotation(id: string, awardReason: string): Promise<QuotationResponseDto> {
  const body: AwardQuotationDto = { awardReason };
  return unwrapApiResult<QuotationResponseDto>(
    await apiClient.POST("/api/v1/procurement/quotations/{id}/award", { params: { path: { id } }, body }),
  );
}
