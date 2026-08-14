"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStockBalance, issueStock, listMovementHistory, listStockBalances, type IssueStockInput, type Movement, type StockBalanceResponseDto } from "../api/stock-movements.api";

/** `["inventory", "stock-movements"]` — same namespaced-per-sub-domain shape `use-categories.ts`/`use-stores.ts`/`use-items.ts` establish. */
export const STOCK_MOVEMENTS_QUERY_KEY = ["inventory", "stock-movements"] as const;

function balanceKey(itemId: string | undefined, storeId: string | undefined) {
  return [...STOCK_MOVEMENTS_QUERY_KEY, "balance", itemId, storeId] as const;
}

function balancesKey(storeId: string | undefined) {
  return [...STOCK_MOVEMENTS_QUERY_KEY, "balances", storeId] as const;
}

function historyKey(itemId: string | undefined, storeId: string | undefined) {
  return [...STOCK_MOVEMENTS_QUERY_KEY, "history", itemId, storeId] as const;
}

/** `inventory:movement:view`-gated. Real `null` `data` (not an error) when no balance row exists yet — `<QueryBoundary>` treats it as its `empty` state, the correct rendering for a genuine zero-history (item, store) pair. */
export function useStockBalance(itemId: string | undefined, storeId: string | undefined) {
  return useQuery({
    queryKey: balanceKey(itemId, storeId),
    queryFn: () => getStockBalance(itemId as string, storeId as string),
    enabled: !!itemId && !!storeId,
  });
}

/** `inventory:movement:view`-gated. Every balance row at one store — backs the store-wide stock position table. */
export function useStockBalances(storeId: string | undefined) {
  return useQuery({
    queryKey: balancesKey(storeId),
    queryFn: () => listStockBalances(storeId as string),
    enabled: !!storeId,
  });
}

/** `inventory:movement:view`-gated. Most-recent-first ledger for one (item, store) pair. */
export function useMovementHistory(itemId: string | undefined, storeId: string | undefined) {
  return useQuery({
    queryKey: historyKey(itemId, storeId),
    queryFn: () => listMovementHistory(itemId as string, storeId as string),
    enabled: !!itemId && !!storeId,
  });
}

/**
 * `inventory:movement:issue`-gated — the ONLY write route on this controller
 * (see `stock-movements.api.ts`'s own doc comment). Invalidates the WHOLE
 * `STOCK_MOVEMENTS_QUERY_KEY` namespace (any store-wide balances table
 * currently mounted could include this (item, store) pair) plus the exact
 * `balance`/`history` keys for the pair just issued against, mirroring
 * `use-items.ts`'s own `invalidateItemQueries()` "whole namespace + specific
 * detail key" hybrid.
 */
export function useIssueStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueStockInput) => issueStock(input),
    onSuccess: (_movement, variables) => {
      queryClient.invalidateQueries({ queryKey: STOCK_MOVEMENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: balanceKey(variables.itemId, variables.storeId) });
      queryClient.invalidateQueries({ queryKey: historyKey(variables.itemId, variables.storeId) });
    },
  });
}

export type { Movement, StockBalanceResponseDto };
