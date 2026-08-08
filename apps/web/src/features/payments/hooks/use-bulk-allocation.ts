"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBulkAllocationBatchDto } from "@klickit/contracts";
import {
  createBulkAllocationBatch,
  getBulkAllocationBatch,
  listBulkAllocationBatchLines,
  matchAndPostBulkAllocationBatch,
} from "../api/bulk-allocation.api";

export const BULK_ALLOCATION_QUERY_KEY = ["payments", "bulk-allocations"] as const;

function detailKey(id: string | undefined) {
  return [...BULK_ALLOCATION_QUERY_KEY, "detail", id] as const;
}
function linesKey(id: string | undefined) {
  return [...BULK_ALLOCATION_QUERY_KEY, "lines", id] as const;
}

/** No `useCreateBulkAllocationBatch`-consuming list screen exists (there is no `GET /payments/bulk-allocations` list endpoint at all, confirmed by reading `BulkAllocationController` — batches are only ever reached by the id the create response returns, or a direct URL), so this mutation has nothing to invalidate beyond its own eventual detail/lines queries, which don't exist yet at create time. */
export function useCreateBulkAllocationBatch() {
  return useMutation({ mutationFn: (dto: CreateBulkAllocationBatchDto) => createBulkAllocationBatch(dto) });
}

export function useBulkAllocationBatch(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getBulkAllocationBatch(id as string), enabled: !!id });
}

export function useBulkAllocationBatchLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listBulkAllocationBatchLines(id as string), enabled: !!id });
}

/**
 * Running match-and-post genuinely changes the batch's own `status`/
 * `createdReceipts` AND every line's `receiptId` — invalidates both this
 * batch's detail and its lines list. Per-line successes also reach into
 * students' receipts/ledger/invoices (via `ReceiptsService.captureReceipt()`)
 * and per-line failures create real `pay_suspense_item` rows — but WHICH
 * students/suspense-items varies per line and isn't known ahead of the real
 * response, so (matching this file's own scope) only the open suspense list
 * is invalidated broadly here; individual students' receipts/ledger/invoices
 * are left to their own natural next refetch, the same documented tradeoff
 * `useBounceCheque()` makes for an analogous reason.
 */
export function useMatchAndPostBulkAllocationBatch(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => matchAndPostBulkAllocationBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: linesKey(id) });
      queryClient.invalidateQueries({ queryKey: ["payments", "suspense", "open"] });
    },
  });
}
