import type { MatchSuspenseItemDto, ReverseSuspenseRefundDto, SuspenseRefundApprovalResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { SuspenseItem } from "../types";

/**
 * Thin wrapper over `SuspenseController`
 * (`packages/server/src/domains/payments/api/suspense.controller.ts`).
 * Permission: `payments:suspense:manage` covers every handler here.
 *
 * `listOpenSuspenseItems()` only ever returns `OPEN` items (confirmed by
 * reading `SuspenseService.listOpen()`) — once an item is `MATCHED`/
 * `REFUNDED` it disappears from this list; `getSuspenseItem()` (`GET
 * .../{id}`, Phase 6 Slice 6's own new backend endpoint) is the only way to
 * look one up afterward — used by the suspense detail route and by
 * `<EntityLabel>`'s new `pay_suspense_item` resolver branch.
 */
export async function listOpenSuspenseItems(): Promise<SuspenseItem[]> {
  return unwrapApiResult<SuspenseItem[]>(await apiClient.GET("/api/v1/payments/suspense"));
}

export async function getSuspenseItem(id: string): Promise<SuspenseItem> {
  return unwrapApiResult<SuspenseItem>(
    await apiClient.GET("/api/v1/payments/suspense/{id}", { params: { path: { id } } }),
  );
}

/** `POST .../{id}/match` — reuses `ReceiptsService.captureReceipt()` internally (confirmed by reading `SuspenseService.matchToStudent()`), producing a real receipt backdated to the item's own `receivedAt`. */
export async function matchSuspenseItem(id: string, dto: MatchSuspenseItemDto): Promise<SuspenseItem> {
  return unwrapApiResult<SuspenseItem>(
    await apiClient.POST("/api/v1/payments/suspense/{id}/match", { params: { path: { id } }, body: dto }),
  );
}

/**
 * `POST .../{id}/refund/request` (`payments:suspense:manage`) — step 1 of 2,
 * the IDENTICAL two-step approval dance `receipts.api.ts`'s
 * `requestReceiptReversal()` establishes for `PAYMENT_REVERSALS`
 * (confirmed by reading `SuspenseController.requestRefund()` directly: no
 * body, same `{instanceId, status}` response shape).
 */
export async function requestSuspenseRefund(id: string): Promise<SuspenseRefundApprovalResponseDto> {
  return unwrapApiResult<SuspenseRefundApprovalResponseDto>(
    await apiClient.POST("/api/v1/payments/suspense/{id}/refund/request", { params: { path: { id } } }),
  );
}

/**
 * `POST .../{id}/refund` — step 2 of 2. **The one real DTO difference from
 * receipt reversal**: `ReverseSuspenseRefundDto` has ONLY `approvalRef`, no
 * `reasonCode` (confirmed directly in `suspense.dto.ts`) — so
 * `<ExecuteSuspenseRefundDialog>` has no reason `<Select>`, unlike
 * `<ExecuteReversalDialog>`.
 */
export async function refundSuspenseItem(id: string, dto: ReverseSuspenseRefundDto): Promise<SuspenseItem> {
  return unwrapApiResult<SuspenseItem>(
    await apiClient.POST("/api/v1/payments/suspense/{id}/refund", { params: { path: { id } }, body: dto }),
  );
}
