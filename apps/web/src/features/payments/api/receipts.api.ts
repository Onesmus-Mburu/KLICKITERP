import type {
  CaptureReceiptDto,
  ReceiptDetailResponseDto,
  ReceiptListResponseDto,
  ReceiptResponseDto,
  ReversalApprovalResponseDto,
  ReverseReceiptDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";
import type { ReceiptSplitMethod } from "../constants";

/**
 * Thin wrapper over `ReceiptsController`
 * (`packages/server/src/domains/payments/api/receipts.controller.ts`).
 * Permissions: `payments:receipt:capture`/`:view`/`:reprint`.
 *
 * `capture()`'s response (`ReceiptResponseDto`) does NOT include
 * `splits`/`allocations` — only `getReceipt()` (`GET .../{id}`,
 * `ReceiptDetailResponseDto`) does, confirmed by reading
 * `receipts.controller.ts`'s two distinct `toView()`/detail-assembly paths.
 * Showing the real post-capture allocation is therefore a genuine second
 * round trip (POST -> navigate -> GET), not derivable from the capture
 * response alone — `features/payments/components/receipt-capture-form.tsx`
 * navigates to `/payments/receipts/{id}` on success rather than trying to
 * render allocations inline from the POST result.
 */
export async function captureReceipt(dto: CaptureReceiptDto): Promise<ReceiptResponseDto> {
  return unwrapApiResult<ReceiptResponseDto>(await apiClient.POST("/api/v1/payments/receipts", { body: dto }));
}

/** `ReceiptsController.list()` requires EXACTLY ONE of `studentId`/`sessionId` — two separate wrapper functions (not one with both optional params) keeps that real constraint visible at every call site instead of letting a caller accidentally pass both or neither. */
export async function listReceiptsByStudent(studentId: string): Promise<ReceiptResponseDto[]> {
  return unwrapApiResult<ReceiptResponseDto[]>(
    await apiClient.GET("/api/v1/payments/receipts", { params: { query: { studentId } } }),
  );
}

export async function listReceiptsBySession(sessionId: string): Promise<ReceiptResponseDto[]> {
  return unwrapApiResult<ReceiptResponseDto[]>(
    await apiClient.GET("/api/v1/payments/receipts", { params: { query: { sessionId } } }),
  );
}

/**
 * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list, backed by
 * `ReceiptsController.list()`'s new THIRD mode (neither `studentId` nor
 * `sessionId` given), gated server-side by `payments:receipt:view-all`. A
 * caller without that permission gets a real `403` here — surfaced by
 * `<QueryBoundary>`'s existing `status===403` -> "permission-denied" state,
 * same as every other permission-gated screen in this app.
 *
 * `unwrapApiResult<ReceiptListResponseDto>(...)` is deliberately typed to
 * the REAL runtime shape this branch returns, independent of what
 * `apiClient.GET`'s generated response type says for this shared route
 * (`GET /payments/receipts` also returns a bare `ReceiptResponseDto[]` for
 * the `studentId`/`sessionId`-scoped branches, so the generated OpenAPI type
 * for this one path can only describe ONE shape) — `unwrapApiResult`'s
 * `result` parameter is structurally typed (`data?: unknown`), so supplying
 * a different `<T>` than the generated type infers is safe and already
 * established elsewhere in this codebase (`use-invoices.ts`'s
 * `optionalQuery()`-workaround callers do the same for a different codegen
 * gap).
 */
export interface ListAllReceiptsParams {
  page?: number;
  pageSize?: number;
  cashierId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** `ReceiptSplitMethod` (`../constants`) — a proper subset of the backend's real `PayReceiptSplitMethod` (it additionally omits `WALLET`, never a real capture method — see that constant's own doc comment), so this stays assignable to the generated query param's wider enum type with no cast. */
  method?: ReceiptSplitMethod;
  /** Phase 6 Slice 9 (Part B) — ILIKE match against the joined student's name or admission number (global-list mode only); omitted below 2 characters by the caller (`app/(erp)/billing/receipts/page.tsx`'s own gating). */
  q?: string;
}

export async function listAllReceipts(params: ListAllReceiptsParams = {}): Promise<ReceiptListResponseDto> {
  return unwrapApiResult<ReceiptListResponseDto>(
    await apiClient.GET("/api/v1/payments/receipts", {
      params: {
        query: optionalQuery({
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
          cashierId: params.cashierId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          method: params.method,
          q: params.q,
        }),
      },
    }),
  );
}

export async function getReceipt(id: string): Promise<ReceiptDetailResponseDto> {
  return unwrapApiResult<ReceiptDetailResponseDto>(
    await apiClient.GET("/api/v1/payments/receipts/{id}", { params: { path: { id } } }),
  );
}

/** `payments:receipt:reprint` — a separately-permissioned action distinct from `:view`/`:capture`; increments `reprint_count` server-side and returns the (splits/allocations-less) `ReceiptResponseDto`, per `receipts.controller.ts`'s own doc comment ("the one column trg_pay_receipt_immutable leaves ordinarily writable"). */
export async function reprintReceipt(id: string): Promise<ReceiptResponseDto> {
  return unwrapApiResult<ReceiptResponseDto>(
    await apiClient.POST("/api/v1/payments/receipts/{id}/reprint", { params: { path: { id } } }),
  );
}

/**
 * `POST /payments/receipts/{id}/reverse/request` (`payments:receipt:reverse`)
 * — step 1 of 2 (BR-PAY-08): submits a `PAYMENT_REVERSALS` approval instance
 * for this receipt. Confirmed by reading `receipts.controller.ts`'s
 * `requestReversal()` directly: genuinely **no request body** — the plan's
 * own "Screens" section describes the Request Reversal dialog as collecting
 * a reason-code `<Select>`, but the plan's own separately-verified "backend
 * facts" section is explicit that this endpoint takes no body at all; the
 * reason code only exists on the EXECUTE step's `ReverseReceiptDto` below.
 * `components/request-reversal-dialog.tsx` is a plain confirm dialog, not a
 * reason-collecting form, reconciling the plan's two sections in favor of
 * the actually-verified endpoint shape.
 */
export async function requestReceiptReversal(id: string): Promise<ReversalApprovalResponseDto> {
  return unwrapApiResult<ReversalApprovalResponseDto>(
    await apiClient.POST("/api/v1/payments/receipts/{id}/reverse/request", { params: { path: { id } } }),
  );
}

/**
 * `POST /payments/receipts/{id}/reverse` (`payments:receipt:reverse`) — step
 * 2 of 2: executes the reversal once `approvalRef` is a real APPROVED
 * `PAYMENT_REVERSALS` instance for this receipt (re-verified server-side —
 * `ReceiptsController.reverse()` re-fetches the instance via
 * `ApprovalEngineService.getStatus()` and rejects a stale/wrong id with a
 * real `422`/`BR-PAY-08`). Returns the NEW contra receipt (a distinct id/
 * number, `RVS-` prefixed) — NOT the original, which only flips to
 * `REVERSED` as a side effect (confirmed by reading `reverseReceipt()`'s
 * return statement directly).
 */
export async function reverseReceipt(id: string, dto: ReverseReceiptDto): Promise<ReceiptResponseDto> {
  return unwrapApiResult<ReceiptResponseDto>(
    await apiClient.POST("/api/v1/payments/receipts/{id}/reverse", { params: { path: { id } }, body: dto }),
  );
}
