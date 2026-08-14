"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateStockTakeDto, DecideStockTakeDto, RecordCountsDto, StockTakeLineResponseDto, StockTakeResponseDto } from "@klickit/contracts";
import {
  createStockTake,
  decideStockTake,
  getApprovalInstanceStatus,
  getStockTake,
  listStockTakeLines,
  listStockTakes,
  postStockTake,
  recordStockTakeCounts,
  submitStockTake,
  type ListStockTakesParams,
} from "../api/stock-takes.api";

/** `["inventory", "stock-takes"]` — same namespaced-per-sub-domain shape every other Inventory hook file establishes. */
export const STOCK_TAKES_QUERY_KEY = ["inventory", "stock-takes"] as const;

function listKey(params: ListStockTakesParams) {
  return [...STOCK_TAKES_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...STOCK_TAKES_QUERY_KEY, "detail", id] as const;
}

function linesKey(id: string | undefined) {
  return [...STOCK_TAKES_QUERY_KEY, "lines", id] as const;
}

function approvalStatusKey(approvalRef: string | null | undefined) {
  return [...STOCK_TAKES_QUERY_KEY, "approval-status", approvalRef] as const;
}

/** `inventory:stock-take:create`-gated (reused across create/list/get/lines, see `stock-takes.controller.ts`'s own per-route decorators — confirmed all 3 GETs share this ONE permission, no separate `:view`). */
export function useStockTakes(params: ListStockTakesParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listStockTakes(params) });
}

export function useStockTake(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getStockTake(id as string), enabled: !!id });
}

/** The variance report — snapshot/counted/variance per line. */
export function useStockTakeLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listStockTakeLines(id as string), enabled: !!id });
}

/**
 * The critical Post-gating query (see `stock-take-status-actions.tsx`'s own
 * doc comment and `stock-takes.api.ts`'s doc comment on why): real
 * `appr_instance.status`, NEVER `stockTake.status` (which deliberately never
 * reaches `APPROVED` — `StockTakesService.onApprovalDecided()`'s own doc
 * comment). `enabled: !!approvalRef` covers the "not yet submitted"
 * (`approvalRef === null`) case — the query simply never runs, and the
 * caller renders its own "not yet submitted" message instead of a loading
 * spinner that would never resolve.
 */
export function useStockTakeApprovalStatus(approvalRef: string | null | undefined) {
  return useQuery({
    queryKey: approvalStatusKey(approvalRef),
    queryFn: () => getApprovalInstanceStatus(approvalRef as string),
    enabled: !!approvalRef,
  });
}

function invalidateStockTakeQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string, approvalRef?: string | null) {
  queryClient.invalidateQueries({ queryKey: STOCK_TAKES_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: linesKey(id) });
  }
  if (approvalRef) {
    queryClient.invalidateQueries({ queryKey: approvalStatusKey(approvalRef) });
  }
}

export function useCreateStockTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStockTakeDto) => createStockTake(dto),
    onSuccess: () => invalidateStockTakeQueries(queryClient),
  });
}

export function useRecordStockTakeCounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RecordCountsDto }) => recordStockTakeCounts(id, dto),
    onSuccess: (stockTake) => invalidateStockTakeQueries(queryClient, stockTake.id),
  });
}

export function useSubmitStockTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitStockTake(id),
    onSuccess: (stockTake) => invalidateStockTakeQueries(queryClient, stockTake.id, stockTake.approvalRef),
  });
}

/** The domain-sync half of a decision only — see `stock-takes.api.ts`'s own doc comment. `<StockTakeStatusActions>` always pairs this with the approvals feature's own `useDecideInstance()`, never calls it alone. */
export function useDecideStockTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideStockTakeDto }) => decideStockTake(id, dto),
    onSuccess: (stockTake) => invalidateStockTakeQueries(queryClient, stockTake.id, stockTake.approvalRef),
  });
}

export function usePostStockTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postStockTake(id),
    onSuccess: (stockTake) => invalidateStockTakeQueries(queryClient, stockTake.id, stockTake.approvalRef),
  });
}

export type { StockTakeLineResponseDto, StockTakeResponseDto };
