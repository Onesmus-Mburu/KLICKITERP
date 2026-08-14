"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddClaimLineDto, ClaimLineResponseDto, ClaimResponseDto, CreateClaimDto, UpdateClaimLineDto } from "@klickit/contracts";
import {
  addClaimLine,
  approveClaim,
  CLAIM_METHODS,
  CLAIM_REIMBURSE_VIA,
  CLAIM_STATUSES,
  createClaim,
  deleteClaimLine,
  getClaim,
  getClaimLines,
  listClaims,
  rejectClaim,
  reimburseClaim,
  submitClaim,
  updateClaimLine,
  type ClaimMethod,
  type ClaimReimburseVia,
  type ClaimStatus,
  type ListClaimsFilters,
} from "../api/claims.api";

/** `["expenses", "claims"]` — namespaced under the shared `"expenses"` feature root alongside `EXPENSE_CATEGORIES_QUERY_KEY`/`EXPENSE_VOUCHERS_QUERY_KEY`/`PETTY_CASH_QUERY_KEY`, the same per-sub-domain-namespaced-under-one-root pattern Parts 1-2 already established. */
export const EXPENSE_CLAIMS_QUERY_KEY = ["expenses", "claims"] as const;

function listKey(filters: ListClaimsFilters) {
  return [...EXPENSE_CLAIMS_QUERY_KEY, "list", filters.staffUserId, filters.status] as const;
}

function detailKey(id: string | undefined) {
  return [...EXPENSE_CLAIMS_QUERY_KEY, "detail", id] as const;
}

function linesKey(claimId: string | undefined) {
  return [...EXPENSE_CLAIMS_QUERY_KEY, "lines", claimId] as const;
}

/** `expenses:claim:create`-gated (reused for every GET too, no separate view permission — see `claims.api.ts`'s own doc comment). */
export function useClaims(filters: ListClaimsFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listClaims(filters) });
}

export function useClaim(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getClaim(id as string), enabled: !!id });
}

export function useClaimLines(claimId: string | undefined) {
  return useQuery({ queryKey: linesKey(claimId), queryFn: () => getClaimLines(claimId as string), enabled: !!claimId });
}

/** Every list query (staffUserId/status-keyed) is invalidated broadly — a status-transition mutation can affect any filtered view currently on screen, the same reasoning `use-vouchers.ts`'s own `invalidateVoucherQueries()` documents. */
function invalidateClaimQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: EXPENSE_CLAIMS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClaimDto) => createClaim(dto),
    onSuccess: () => invalidateClaimQueries(queryClient),
  });
}

/** Invalidates BOTH the lines list AND the claim detail — the server recomputes `claim.total` on every add, see `claims.api.ts`'s own doc comment; a caller relying only on `claim.total` (never computing it client-side) needs the detail query fresh too. */
export function useAddClaimLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, dto }: { claimId: string; dto: AddClaimLineDto }) => addClaimLine(claimId, dto),
    onSuccess: (line) => {
      queryClient.invalidateQueries({ queryKey: linesKey(line.claimId) });
      invalidateClaimQueries(queryClient, line.claimId);
    },
  });
}

/** Same dual-invalidation reasoning as `useAddClaimLine()` — `total` changes on every edit that touches `amount`, and possibly on any edit at all (server-side recompute, never assumed client-side). */
export function useUpdateClaimLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, dto }: { claimId: string; lineId: string; dto: UpdateClaimLineDto }) => updateClaimLine(lineId, dto),
    onSuccess: (line) => {
      queryClient.invalidateQueries({ queryKey: linesKey(line.claimId) });
      invalidateClaimQueries(queryClient, line.claimId);
    },
  });
}

/** Same dual-invalidation reasoning as `useAddClaimLine()`. `deleteClaimLine()`'s own response has no `claimId` on it (just `{ deleted: boolean }`), so the caller's own `claimId` (passed in via mutation variables, threaded down from the currently-open claim) is what keys the invalidation instead. */
export function useDeleteClaimLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId }: { claimId: string; lineId: string }) => deleteClaimLine(lineId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: linesKey(variables.claimId) });
      invalidateClaimQueries(queryClient, variables.claimId);
    },
  });
}

/** `expenses:claim:submit`-gated. See `claims.api.ts`'s own doc comment on `submitClaim()` for the zero-lines rejection — `<ClaimStatusActions>` is the caller responsible for disabling the trigger client-side too. */
export function useSubmitClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitClaim(id),
    onSuccess: (updated) => invalidateClaimQueries(queryClient, updated.id),
  });
}

/** `expenses:claim:decide`-gated. */
export function useApproveClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveClaim(id),
    onSuccess: (updated) => invalidateClaimQueries(queryClient, updated.id),
  });
}

/** `expenses:claim:decide`-gated. A real, dedicated REJECTED status — see `claims.api.ts`'s own doc comment. */
export function useRejectClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectClaim(id),
    onSuccess: (updated) => invalidateClaimQueries(queryClient, updated.id),
  });
}

/** `expenses:claim:reimburse`-gated. See `claims.api.ts`'s own doc comment on `reimburseClaim()` for the DIRECT-vs-PAYROLL `method` branching — `<ClaimStatusActions>` is the caller responsible for surfacing that distinction clearly in its own confirm dialog copy. */
export function useReimburseClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, method }: { id: string; method?: ClaimMethod }) => reimburseClaim(id, method),
    onSuccess: (updated) => invalidateClaimQueries(queryClient, updated.id),
  });
}

export {
  CLAIM_METHODS,
  CLAIM_REIMBURSE_VIA,
  CLAIM_STATUSES,
  type ClaimLineResponseDto,
  type ClaimMethod,
  type ClaimReimburseVia,
  type ClaimResponseDto,
  type ClaimStatus,
};
