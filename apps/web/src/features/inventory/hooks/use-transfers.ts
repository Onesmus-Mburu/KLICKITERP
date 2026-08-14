"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueTransferDto, TransferLineResponseDto, TransferResponseDto } from "@klickit/contracts";
import { cancelTransfer, getTransfer, issueTransfer, listTransferLines, listTransfers, receiveTransfer, type ListTransfersParams } from "../api/transfers.api";
import { STOCK_MOVEMENTS_QUERY_KEY } from "./use-stock-movements";

/** `["inventory", "transfers"]` — same namespaced-per-sub-domain shape every other Inventory hook file establishes. */
export const TRANSFERS_QUERY_KEY = ["inventory", "transfers"] as const;

function listKey(params: ListTransfersParams) {
  return [...TRANSFERS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...TRANSFERS_QUERY_KEY, "detail", id] as const;
}

function linesKey(id: string | undefined) {
  return [...TRANSFERS_QUERY_KEY, "lines", id] as const;
}

/** `inventory:transfer:issue`-gated (reused across every GET on this controller, see `transfers.api.ts`'s own doc comment). */
export function useTransfers(params: ListTransfersParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listTransfers(params) });
}

export function useTransfer(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTransfer(id as string), enabled: !!id });
}

export function useTransferLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listTransferLines(id as string), enabled: !!id });
}

/**
 * Invalidates every query this mutation could stale: the transfers list +
 * detail (a status change), AND — since issuing/receiving/cancelling a
 * transfer always mutates `inv_stock_balance` at one or both stores involved
 * — the WHOLE `STOCK_MOVEMENTS_QUERY_KEY` namespace too, so a stock-movements
 * view mounted elsewhere (a different page, or this same page's own
 * `<StockBalanceView>` if ever composed alongside a transfer action) never
 * shows a stale balance after a transfer mutation. A real, deliberate
 * cross-feature invalidation — the first case in this codebase where one
 * feature's mutation hook needs to invalidate a DIFFERENT feature's query
 * cache, since Stock Movements and Transfers are the first two Inventory
 * sub-domains that both read/write the same underlying `inv_stock_balance`
 * table.
 */
function invalidateTransferQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: TRANSFERS_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: linesKey(id) });
  }
  queryClient.invalidateQueries({ queryKey: STOCK_MOVEMENTS_QUERY_KEY });
}

/** `inventory:transfer:issue`-gated. No DRAFT state — this genuinely moves stock immediately (see `transfers.api.ts`'s own doc comment). */
export function useIssueTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: IssueTransferDto) => issueTransfer(dto),
    onSuccess: (transfer) => invalidateTransferQueries(queryClient, transfer.id),
  });
}

/** `inventory:transfer:receive`-gated — the one route on this controller with its own distinct permission. */
export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => receiveTransfer(id),
    onSuccess: (transfer) => invalidateTransferQueries(queryClient, transfer.id),
  });
}

/** `inventory:transfer:issue`-gated (cancel reuses the issue permission, not a distinct one — see `transfers.api.ts`'s own doc comment). */
export function useCancelTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelTransfer(id),
    onSuccess: (transfer) => invalidateTransferQueries(queryClient, transfer.id),
  });
}

export type { TransferLineResponseDto, TransferResponseDto };
