"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaptureReceiptDto, ReverseReceiptDto } from "@klickit/contracts";
import { useInstancesForDomain } from "@/features/approvals/hooks/use-instances";
import { PAYMENT_REVERSALS_DOMAIN_CODE } from "../constants";
import { pickLatestInstanceForEntity } from "../lib/reversal";
import {
  captureReceipt,
  getReceipt,
  listAllReceipts,
  listReceiptsByStudent,
  listReceiptsBySession,
  reprintReceipt,
  requestReceiptReversal,
  reverseReceipt,
  type ListAllReceiptsParams,
} from "../api/receipts.api";

export const RECEIPTS_QUERY_KEY = ["payments", "receipts"] as const;

function studentReceiptsKey(studentId: string | undefined) {
  return [...RECEIPTS_QUERY_KEY, "student", studentId] as const;
}
function sessionReceiptsKey(sessionId: string | undefined) {
  return [...RECEIPTS_QUERY_KEY, "session", sessionId] as const;
}
function detailKey(id: string | undefined) {
  return [...RECEIPTS_QUERY_KEY, "detail", id] as const;
}

export function useStudentReceipts(studentId: string | undefined) {
  return useQuery({
    queryKey: studentReceiptsKey(studentId),
    queryFn: () => listReceiptsByStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useSessionReceipts(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionReceiptsKey(sessionId),
    queryFn: () => listReceiptsBySession(sessionId as string),
    enabled: !!sessionId,
  });
}

export function useReceipt(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getReceipt(id as string), enabled: !!id });
}

/**
 * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list screen.
 * `params` is the whole query key, same convention `useOpenInvoices()`
 * (`features/billing/hooks/use-invoices.ts`) already established for its own
 * server-paginated list — a page/pageSize/filter change is a genuinely
 * different query, correctly cache-keyed rather than silently reusing a
 * stale entry. A caller lacking `payments:receipt:view-all` gets a real
 * `ApiError` with `status===403` on `query.error` — surfaced by
 * `<QueryBoundary>`'s existing permission-denied state, not special-cased
 * here.
 */
export function useAllReceipts(params: ListAllReceiptsParams = {}) {
  return useQuery({
    queryKey: [...RECEIPTS_QUERY_KEY, "all", params],
    queryFn: () => listAllReceipts(params),
  });
}

/**
 * A captured receipt genuinely changes THREE things beyond its own record —
 * per the plan's explicit instruction, this is not a receipts-only
 * invalidation:
 *  1. The paying student's ledger — `["students","ledger",studentId]`,
 *     `features/students/hooks/use-ledger.ts`'s own exact query key
 *     (confirmed by reading it). `ReceiptsService.captureReceipt()` step 10
 *     really does append a new `std_ledger_entry` row in the same
 *     transaction.
 *  2. That student's billing invoices list —
 *     `["billing","invoices","student",studentId]`,
 *     `features/billing/hooks/use-invoices.ts`'s `studentInvoicesKey()`
 *     (confirmed by reading it — the same key `usePostInvoice`/
 *     `useVoidInvoice` already invalidate for an analogous reason).
 *     `ReceiptsService.captureReceipt()` step 9 really does mutate
 *     `bill_invoice.paidAmount`/`.balance`/`.status` in the same
 *     transaction when an allocation targets a real invoice.
 *  3. This session's own receipts list, if the receipt used one (CASH — or
 *     any method captured while a session happens to be open; see
 *     `receipt-capture-form.tsx`'s own doc comment on why `sessionId` is
 *     sent whenever a session is open, not only for CASH splits).
 */
export function useCaptureReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CaptureReceiptDto) => captureReceipt(dto),
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: studentReceiptsKey(receipt.studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", receipt.studentId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", "student", receipt.studentId] });
      if (receipt.sessionId) {
        queryClient.invalidateQueries({ queryKey: sessionReceiptsKey(receipt.sessionId) });
      }
    },
  });
}

export function useReprintReceipt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reprintReceipt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}

/**
 * The entity-status-resolution use case (per the plan): fetches every
 * `PAYMENT_REVERSALS` instance and derives `latestInstance` for THIS
 * receipt via `pickLatestInstanceForEntity()` — `undefined` while the
 * underlying query hasn't resolved yet, `null` once resolved with no
 * reversal ever requested, or the real `Instance` otherwise. Spreads the raw
 * `useInstancesForDomain()` query result too (`isLoading`/`isError`/
 * `refetch`/...) so callers that need to force a fresh read right before
 * executing (see `execute-reversal-dialog.tsx` — "always use the freshest
 * instance") can call `.refetch()` directly.
 */
export function useReceiptReversalInstance(receiptId: string | undefined) {
  const domainQuery = useInstancesForDomain(receiptId ? PAYMENT_REVERSALS_DOMAIN_CODE : undefined);
  const latestInstance = React.useMemo(() => {
    if (!receiptId || !domainQuery.data) return undefined;
    return pickLatestInstanceForEntity(domainQuery.data, receiptId);
  }, [domainQuery.data, receiptId]);

  return { ...domainQuery, latestInstance };
}

/** `POST .../reverse/request` — step 1 of 2. Doesn't change any RECEIPT field (the original stays POSTED until executed), so the only cache this needs to invalidate is the reversal-status query itself (the SAME `["approvals","instances","domain","PAYMENT_REVERSALS"]` key `features/approvals/hooks/use-instances.ts`'s own `domainKey()` produces — duplicated here as a literal, matching this file's own established cross-feature-invalidation convention above, e.g. `["students","ledger",studentId]`). */
export function useRequestReceiptReversal(receiptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestReceiptReversal(receiptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", "instances", "domain", PAYMENT_REVERSALS_DOMAIN_CODE] });
    },
  });
}

/**
 * `POST .../reverse` — step 2 of 2. Executing a reversal genuinely changes
 * FOUR things beyond the reversal-status query itself: the ORIGINAL
 * receipt's own detail (flips to `REVERSED`, `reversalReason`/`approvalRef`
 * set — `reverseReceipt()`'s response is the CONTRA, not the original, so
 * `detailKey(receiptId)` must be explicitly invalidated to pick that up),
 * the contra's owning student's receipts list (the new `RVS-` receipt),
 * ledger (`ReceiptsService.reverseReceipt()` step "student ledger entry"
 * really does append a new `std_ledger_entry` row), and billing invoices
 * (the unwound allocation mutates `bill_invoice.paidAmount`/`balance`/
 * `status`) — the SAME three cross-feature keys `useCaptureReceipt()` above
 * already invalidates for the analogous reason, confirmed by reading
 * `reverseReceipt()`'s own transaction directly.
 */
export function useReverseReceipt(receiptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ReverseReceiptDto) => reverseReceipt(receiptId, dto),
    onSuccess: (contra) => {
      queryClient.invalidateQueries({ queryKey: detailKey(receiptId) });
      queryClient.invalidateQueries({ queryKey: studentReceiptsKey(contra.studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", contra.studentId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", "student", contra.studentId] });
      queryClient.invalidateQueries({ queryKey: ["approvals", "instances", "domain", PAYMENT_REVERSALS_DOMAIN_CODE] });
    },
  });
}
