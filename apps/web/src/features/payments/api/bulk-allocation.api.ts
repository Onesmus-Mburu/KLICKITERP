import type { BulkAllocationBatchLineResponseDto, BulkAllocationBatchResponseDto, CreateBulkAllocationBatchDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `BulkAllocationController`
 * (`packages/server/src/domains/payments/api/bulk-allocation.controller.ts`)
 * — `payments:bulk-allocation:manage` covers every handler.
 *
 * `createBatch()` resolves EVERY line's `admissionNo` to a student
 * SYNCHRONOUSLY at create time (confirmed by reading
 * `BulkAllocationService.createBatch()` directly) — any unresolved
 * admission number rejects the WHOLE batch up front with a real `422`
 * listing every offending value. This wrapper is a genuine ONE-SHOT batch
 * `POST` (the full line array in one call), not N sequential calls the way
 * Students' bulk-import has to be (no real batch endpoint exists there) —
 * `lib/bulk-allocation-resolve.ts`'s preview step exists specifically to
 * catch unresolved admission numbers BEFORE this call, so a real submission
 * is expected to succeed.
 */
/**
 * A real, confirmed OpenAPI-codegen gap, the same CLASS `sessions.api.ts`'s
 * `closeSession()` already documents: `CreateBulkAllocationBatchDto`'s
 * GENERATED type declares `instrument: Record<string, never>` — the real
 * server-side DTO has `@ApiProperty({ type: Object }) instrument!:
 * Record<string, unknown>` (`bulk-allocation.dto.ts`), and `type: Object`
 * gives Swagger no property-VALUE type to reflect, so `openapi-typescript`
 * emits the unusable empty-object placeholder instead of a real dictionary.
 * One documented, narrow cast to the shape the generated client's types
 * (wrongly) expect — the actual JSON sent over the wire is unaffected.
 */
export async function createBulkAllocationBatch(dto: CreateBulkAllocationBatchDto): Promise<BulkAllocationBatchResponseDto> {
  const body = dto as unknown as {
    instrument: Record<string, never>;
    lines: CreateBulkAllocationBatchDto["lines"];
    bankAccountId: CreateBulkAllocationBatchDto["bankAccountId"];
  };
  return unwrapApiResult<BulkAllocationBatchResponseDto>(
    await apiClient.POST("/api/v1/payments/bulk-allocations", { body }),
  );
}

export async function getBulkAllocationBatch(id: string): Promise<BulkAllocationBatchResponseDto> {
  return unwrapApiResult<BulkAllocationBatchResponseDto>(
    await apiClient.GET("/api/v1/payments/bulk-allocations/{id}", { params: { path: { id } } }),
  );
}

export async function listBulkAllocationBatchLines(id: string): Promise<BulkAllocationBatchLineResponseDto[]> {
  return unwrapApiResult<BulkAllocationBatchLineResponseDto[]>(
    await apiClient.GET("/api/v1/payments/bulk-allocations/{id}/lines", { params: { path: { id } } }),
  );
}

/**
 * `POST .../{id}/match-and-post` — already transactional per line and
 * already partial-failure-tolerant server-side (confirmed by reading
 * `BulkAllocationService.matchAndPost()`: a failed line parks its amount
 * into `pay_suspense_item` rather than aborting the whole run). Returns the
 * updated batch (`status`/`createdReceipts`) — the caller re-fetches
 * `.../lines` separately for the real per-line outcome, since this response
 * alone doesn't carry per-line detail.
 */
export async function matchAndPostBulkAllocationBatch(id: string): Promise<BulkAllocationBatchResponseDto> {
  return unwrapApiResult<BulkAllocationBatchResponseDto>(
    await apiClient.POST("/api/v1/payments/bulk-allocations/{id}/match-and-post", { params: { path: { id } } }),
  );
}
