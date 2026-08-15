"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAdjustmentDto, ManualMatchDto, ReopenReconciliationDto, StartReconciliationDto } from "@klickit/contracts";
import {
  autoMatch,
  createAdjustment,
  getReconciliation,
  getReconciliationMatches,
  listReconciliations,
  lockReconciliation,
  manualMatch,
  reopenReconciliation,
  startReconciliation,
  type BankReconciliation,
  type ListReconciliationsFilters,
} from "../api/reconciliation.api";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — `["banking",
 * "reconciliations"]` query-key convention, mirroring every other sub-domain
 * in this feature folder (`use-accounts.ts`/`use-transfers.ts`/
 * `use-statement-import.ts`). 3 query shapes: list (filtered by
 * accountId/status), detail, and matches (the real `bank_recon_match` rows
 * created so far, a distinct endpoint/query key from the detail
 * reconciliation object itself).
 */
export const BANKING_RECONCILIATIONS_QUERY_KEY = ["banking", "reconciliations"] as const;

function listKey(filters: ListReconciliationsFilters) {
  return [...BANKING_RECONCILIATIONS_QUERY_KEY, "list", filters] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_RECONCILIATIONS_QUERY_KEY, "detail", id] as const;
}

function matchesKey(id: string | undefined) {
  return [...BANKING_RECONCILIATIONS_QUERY_KEY, "matches", id] as const;
}

/** `banking:reconciliation:manage`-gated — the SAME permission also gates this list (see `reconciliation.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useReconciliations(filters: ListReconciliationsFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listReconciliations(filters) });
}

export function useReconciliation(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getReconciliation(id as string), enabled: !!id });
}

/** The real, persisted `bank_recon_match` rows — NOT the same thing as `autoMatch()`'s own ephemeral pass-3 `suggestions` (see `use-*` mutation below). */
export function useReconciliationMatches(id: string | undefined) {
  return useQuery({ queryKey: matchesKey(id), queryFn: () => getReconciliationMatches(id as string), enabled: !!id });
}

function invalidateReconciliationQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: BANKING_RECONCILIATIONS_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: matchesKey(id) });
  }
}

export function useStartReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: StartReconciliationDto) => startReconciliation(dto),
    onSuccess: (created) => invalidateReconciliationQueries(queryClient, created.id),
  });
}

/** Passes 1-2 create real match rows server-side in this one call — invalidates the matches query so the caller's own persisted-matches list reflects them immediately. The response's own `suggestions` (pass 3) are NOT persisted anywhere; the caller holds them in local component state until each is individually applied via `useManualMatch()`. */
export function useAutoMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => autoMatch(id),
    onSuccess: (_result, id) => invalidateReconciliationQueries(queryClient, id),
  });
}

export function useManualMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ManualMatchDto }) => manualMatch(id, dto),
    onSuccess: (_result, { id }) => invalidateReconciliationQueries(queryClient, id),
  });
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateAdjustmentDto }) => createAdjustment(id, dto),
    onSuccess: (_result, { id }) => invalidateReconciliationQueries(queryClient, id),
  });
}

/** BR-BANK-03 — recomputes balances and snapshots `outstanding` server-side; see `reconciliation.api.ts`'s own doc comment for the REOPENED-can-never-relock dead end this mutation's caller must respect (no "lock" action is ever offered once `status === "REOPENED"`). */
export function useLockReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lockReconciliation(id),
    onSuccess: (updated) => invalidateReconciliationQueries(queryClient, updated.id),
  });
}

export function useReopenReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ReopenReconciliationDto }) => reopenReconciliation(id, dto),
    onSuccess: (updated) => invalidateReconciliationQueries(queryClient, updated.id),
  });
}

/**
 * BR-BANK-03 client-side advisory helper — the one cross-module addition
 * this part makes. `FiscalYearsService.hardClosePeriod()`
 * (`packages/server/src/accounting/application/fiscal-years.service.ts`,
 * confirmed by reading it directly) has ZERO reference to banking anywhere:
 * a period can be hard-closed today with an unlocked/never-started bank
 * reconciliation and no server-side error — a real, twice-reflagged (in this
 * entity's own doc comment AND `ReconciliationService`'s own class doc
 * comment) cross-module gap that stays a backend architecture change outside
 * THIS frontend part's own scope. `GET /banking/reconciliations` has no
 * `periodId` filter, so this fetches the full `IN_PROGRESS` list (already
 * filtered server-side by status) and cross-references client-side against
 * the one `periodId` the caller cares about.
 *
 * Consumed from `features/accounting/components/period-status-actions.tsx`
 * — a deliberate cross-feature hook import, the SAME precedent
 * `create-payment-voucher-dialog.tsx` (Procurement, Part 1's own retrofit)
 * already established by importing this exact feature folder's own
 * `use-accounts.ts`: this codebase's per-feature-boundary discipline holds
 * for same-module-internal reuse, but a genuine CROSS-MODULE feature (a
 * period-close screen advising on bank reconciliation state) is exactly the
 * case that precedent carves out.
 */
export function useInProgressReconciliationsForPeriod(periodId: string | undefined) {
  const query = useReconciliations({ status: "IN_PROGRESS" });
  const forPeriod = periodId ? (query.data ?? []).filter((r) => r.periodId === periodId) : [];
  return { ...query, data: forPeriod };
}

export type { BankReconciliation, ListReconciliationsFilters };
export {
  BANK_RECONCILIATION_STATUSES,
  type BankReconciliationStatus,
  type OutstandingJournalLine,
  type OutstandingStatementLine,
  type ReconciliationOutstanding,
  type ReopenHistoryEntry,
} from "../api/reconciliation.api";
export type { AutoMatchResultDto, AutoMatchSuggestionDto, BankReconMatchResponseDto } from "../api/reconciliation.api";
