"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDepositOrWithdrawalDto } from "@klickit/contracts";
import {
  acknowledgeReceiver,
  acknowledgeSender,
  approveDepositOrWithdrawal,
  createDepositOrWithdrawal,
  getDepositOrWithdrawal,
  listDepositsOrWithdrawals,
  postDepositOrWithdrawal,
  rejectDepositOrWithdrawal,
  submitDepositOrWithdrawal,
  type DepositWithdrawal,
  type DepositWithdrawalKind,
  type ListDepositsOrWithdrawalsFilters,
} from "../api/deposits-withdrawals.api";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared hook set for
 * BOTH Deposits and Withdrawals (`deposits-withdrawals.api.ts`'s own doc
 * comment explains why one shared implementation, not two near-duplicate
 * files). Every hook here takes `kind: DepositWithdrawalKind` and resolves
 * to its own SEPARATE query-key root (`["banking","deposits"]` vs
 * `["banking","withdrawals"]`) — a deposit and a withdrawal never share a
 * cache entry even though they share every function/type, so invalidating
 * one kind's queries never touches the other's.
 */
export const BANKING_DEPOSITS_QUERY_KEY = ["banking", "deposits"] as const;
export const BANKING_WITHDRAWALS_QUERY_KEY = ["banking", "withdrawals"] as const;

function rootKey(kind: DepositWithdrawalKind) {
  return kind === "deposit" ? BANKING_DEPOSITS_QUERY_KEY : BANKING_WITHDRAWALS_QUERY_KEY;
}

function listKey(kind: DepositWithdrawalKind, filters: ListDepositsOrWithdrawalsFilters) {
  return [...rootKey(kind), "list", filters] as const;
}

function detailKey(kind: DepositWithdrawalKind, id: string | undefined) {
  return [...rootKey(kind), "detail", id] as const;
}

/** `banking:deposit:create`/`banking:withdrawal:create`-gated (per `kind`) — the SAME permission also gates this list (see `deposits-withdrawals.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useDepositsOrWithdrawals(kind: DepositWithdrawalKind, filters: ListDepositsOrWithdrawalsFilters = {}) {
  return useQuery({ queryKey: listKey(kind, filters), queryFn: () => listDepositsOrWithdrawals(kind, filters) });
}

export function useDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string | undefined) {
  return useQuery({ queryKey: detailKey(kind, id), queryFn: () => getDepositOrWithdrawal(kind, id as string), enabled: !!id });
}

function invalidateDwQueries(queryClient: ReturnType<typeof useQueryClient>, kind: DepositWithdrawalKind, id?: string) {
  queryClient.invalidateQueries({ queryKey: rootKey(kind) });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(kind, id) });
}

export function useCreateDepositOrWithdrawal(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDepositOrWithdrawalDto) => createDepositOrWithdrawal(kind, dto),
    onSuccess: (created) => invalidateDwQueries(queryClient, kind, created.id),
  });
}

export function useSubmitDepositOrWithdrawal(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitDepositOrWithdrawal(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

export function useApproveDepositOrWithdrawal(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveDepositOrWithdrawal(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

export function useRejectDepositOrWithdrawal(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectDepositOrWithdrawal(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

/** Realizes the 2-line Undeposited-Funds journal server-side — see `deposits-withdrawals.api.ts`'s own "GL posting" doc comment for the exact (mirrored) mechanism per kind. */
export function usePostDepositOrWithdrawal(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postDepositOrWithdrawal(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

/** FR-BANK-007 — no status guard, callable at any time (see `deposits-withdrawals.api.ts`'s own doc comment). */
export function useAcknowledgeSender(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeSender(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

/** FR-BANK-007 — no status guard, callable at any time (see `deposits-withdrawals.api.ts`'s own doc comment). */
export function useAcknowledgeReceiver(kind: DepositWithdrawalKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeReceiver(kind, id),
    onSuccess: (updated) => invalidateDwQueries(queryClient, kind, updated.id),
  });
}

export type { DepositWithdrawal, DepositWithdrawalKind, ListDepositsOrWithdrawalsFilters };
export { BANK_DEPOSIT_WITHDRAWAL_STATUSES, isDraftPlaceholderNumber } from "../api/deposits-withdrawals.api";
export type { BankDepositWithdrawalStatus } from "../api/deposits-withdrawals.api";
