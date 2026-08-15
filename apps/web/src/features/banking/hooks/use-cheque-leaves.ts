"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankChequeLeafResponseDto, IssueChequeLeafDto, ReasonDto } from "@klickit/contracts";
import {
  cancelChequeLeaf,
  flagStaleChequeLeaves,
  getChequeLeaf,
  issueChequeLeaf,
  listChequeLeaves,
  markChequeLeafCleared,
  markChequeLeafPresented,
  stopChequeLeaf,
  type ListChequeLeavesFilters,
} from "../api/cheque-leaves.api";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — `["banking", "cheque-leaves"]` query-key convention, mirroring every
 * other sub-domain in this feature folder. `useIssueChequeLeaf()` and every
 * status-transition mutation below all invalidate BOTH this file's own query
 * root AND `use-cheque-books.ts`'s own — a book's own detail page renders its
 * leaves list inline (`app/(erp)/banking/cheque-books/[id]/page.tsx`), so a
 * status change made from the global leaves list
 * (`app/(erp)/banking/cheque-leaves/page.tsx`) must still be reflected there
 * without a manual refresh, and vice versa.
 */
export const BANKING_CHEQUE_LEAVES_QUERY_KEY = ["banking", "cheque-leaves"] as const;

function listKey(filters: ListChequeLeavesFilters) {
  return [...BANKING_CHEQUE_LEAVES_QUERY_KEY, "list", filters] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_CHEQUE_LEAVES_QUERY_KEY, "detail", id] as const;
}

/** `banking:cheque-leaf:manage`-gated — the SAME permission also gates this list AND the single-leaf GET (see `cheque-leaves.api.ts`'s own doc comment; `:issue` alone does NOT grant this). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useChequeLeaves(filters: ListChequeLeavesFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listChequeLeaves(filters) });
}

export function useChequeLeaf(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getChequeLeaf(id as string), enabled: !!id });
}

function invalidateChequeLeafQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: BANKING_CHEQUE_LEAVES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
  // A book's own detail page renders its leaves inline — see this file's own doc comment.
  queryClient.invalidateQueries({ queryKey: ["banking", "cheque-books"] });
}

/** BR-BANK-04 — auto-picks the lowest-numbered UNUSED leaf in `dto.bookId`; the resulting `leafNo` is only known from the RESPONSE, never chosen up front. `banking:cheque-leaf:issue`-gated, a SEPARATE permission from every other mutation below (see `cheque-leaves.api.ts`'s own doc comment). */
export function useIssueChequeLeaf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: IssueChequeLeafDto) => issueChequeLeaf(dto),
    onSuccess: (issued) => invalidateChequeLeafQueries(queryClient, issued.id),
  });
}

export function useMarkChequeLeafPresented() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markChequeLeafPresented(id),
    onSuccess: (updated) => invalidateChequeLeafQueries(queryClient, updated.id),
  });
}

export function useMarkChequeLeafCleared() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markChequeLeafCleared(id),
    onSuccess: (updated) => invalidateChequeLeafQueries(queryClient, updated.id),
  });
}

export function useStopChequeLeaf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ReasonDto }) => stopChequeLeaf(id, dto),
    onSuccess: (updated) => invalidateChequeLeafQueries(queryClient, updated.id),
  });
}

export function useCancelChequeLeaf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ReasonDto }) => cancelChequeLeaf(id, dto),
    onSuccess: (updated) => invalidateChequeLeafQueries(queryClient, updated.id),
  });
}

/** Manual bulk trigger — see `cheque-leaves.api.ts`'s own doc comment on why no scheduler calls this automatically. Returns the real list of leaves it flagged (often empty — a normal, expected outcome). */
export function useFlagStaleChequeLeaves() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => flagStaleChequeLeaves(),
    onSuccess: () => invalidateChequeLeafQueries(queryClient),
  });
}

export type { BankChequeLeafResponseDto, ListChequeLeavesFilters };
export { BANK_CHEQUE_LEAF_STATUSES, type BankChequeLeafStatus } from "../api/cheque-leaves.api";
