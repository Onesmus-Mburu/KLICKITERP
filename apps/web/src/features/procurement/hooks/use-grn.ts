"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReceiveGrnDto } from "@klickit/contracts";
import { getGrn, getGrnLines, listGrnByPo, postGrn, receiveGrn } from "../api/grn.api";
import { PURCHASE_ORDERS_QUERY_KEY } from "./use-purchase-orders";

/** `["procurement", "grn"]` — namespaced under `"procurement"`, the same shape every other sub-domain hook in this feature folder already established. */
export const GRN_QUERY_KEY = ["procurement", "grn"] as const;

function listByPoKey(poId: string | undefined) {
  return [...GRN_QUERY_KEY, "list", poId] as const;
}

function detailKey(id: string | undefined) {
  return [...GRN_QUERY_KEY, "detail", id] as const;
}

function linesKey(grnId: string | undefined) {
  return [...GRN_QUERY_KEY, "lines", grnId] as const;
}

/** `procurement:grn:receive`-gated (reused for every GET, see `grn.api.ts`'s own doc comment). `poId` is genuinely required on the real endpoint. */
export function useGrnsByPo(poId: string | undefined) {
  return useQuery({ queryKey: listByPoKey(poId), queryFn: () => listGrnByPo(poId as string), enabled: !!poId });
}

export function useGrn(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getGrn(id as string), enabled: !!id });
}

export function useGrnLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => getGrnLines(id as string), enabled: !!id });
}

/**
 * `receive()`/`post()` both roll the parent PO's own state (`receive()` via
 * `PurchaseOrdersService.updateReceivingStatus()`'s auto status roll —
 * ISSUED -> PARTIALLY_RECEIVED -> RECEIVED — plus each PO line's own
 * `receivedQty`; `post()` doesn't change the PO further but the GRN history
 * card sits right next to `<PoStatusActions>` on the same page) — both
 * mutations below invalidate `PURCHASE_ORDERS_QUERY_KEY` too, so a
 * still-open PO detail view refreshes to its new status/line quantities
 * without a manual reload.
 */
function invalidateGrnQueries(queryClient: ReturnType<typeof useQueryClient>, poId: string, grnId: string) {
  queryClient.invalidateQueries({ queryKey: GRN_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: listByPoKey(poId) });
  queryClient.invalidateQueries({ queryKey: detailKey(grnId) });
  queryClient.invalidateQueries({ queryKey: linesKey(grnId) });
  queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_QUERY_KEY });
}

export function useReceiveGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ReceiveGrnDto) => receiveGrn(dto),
    onSuccess: (grn) => invalidateGrnQueries(queryClient, grn.poId, grn.id),
  });
}

export function usePostGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postGrn(id),
    onSuccess: (grn) => invalidateGrnQueries(queryClient, grn.poId, grn.id),
  });
}

export type { Grn, GrnStatus } from "../api/grn.api";
export type { GrnLineResponseDto } from "@klickit/contracts";
