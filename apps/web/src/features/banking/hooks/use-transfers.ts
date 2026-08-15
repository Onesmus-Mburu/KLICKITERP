"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBankTransferDto } from "@klickit/contracts";
import {
  approveTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  postTransfer,
  rejectTransfer,
  submitTransfer,
  type BankTransferResponseDto,
  type ListTransfersFilters,
} from "../api/transfers.api";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — `["banking", "transfers"]`
 * query-key convention, mirroring `use-accounts.ts`'s (Part 1) own
 * `["banking", "accounts"]` shape and `use-payment-vouchers.ts`'s
 * (Procurement) own submit/approve/reject mutation shape.
 */
export const BANKING_TRANSFERS_QUERY_KEY = ["banking", "transfers"] as const;

function listKey(filters: ListTransfersFilters) {
  return [...BANKING_TRANSFERS_QUERY_KEY, "list", filters] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_TRANSFERS_QUERY_KEY, "detail", id] as const;
}

/** `banking:transfer:create`-gated — the SAME permission also gates this list (see `transfers.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useTransfers(filters: ListTransfersFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listTransfers(filters) });
}

export function useTransfer(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTransfer(id as string), enabled: !!id });
}

function invalidateTransferQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: BANKING_TRANSFERS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBankTransferDto) => createTransfer(dto),
    onSuccess: (created) => invalidateTransferQueries(queryClient, created.id),
  });
}

export function useSubmitTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitTransfer(id),
    onSuccess: (updated) => invalidateTransferQueries(queryClient, updated.id),
  });
}

export function useApproveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveTransfer(id),
    onSuccess: (updated) => invalidateTransferQueries(queryClient, updated.id),
  });
}

export function useRejectTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectTransfer(id),
    onSuccess: (updated) => invalidateTransferQueries(queryClient, updated.id),
  });
}

/** Realizes P-32's 4-line journal server-side — see `transfers.api.ts`'s own doc comment. */
export function usePostTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postTransfer(id),
    onSuccess: (updated) => invalidateTransferQueries(queryClient, updated.id),
  });
}

export type { BankTransferResponseDto };
export { BANK_TRANSFER_STATUSES, isDraftPlaceholderNumber } from "../api/transfers.api";
export type { BankTransferStatus, ListTransfersFilters } from "../api/transfers.api";
