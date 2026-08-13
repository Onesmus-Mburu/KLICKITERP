"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePurchaseOrderDto, PurchaseOrderLineResponseDto, RevisePurchaseOrderDto } from "@klickit/contracts";
import {
  approvePurchaseOrder,
  createPurchaseOrder,
  createPurchaseOrderDirect,
  getPurchaseOrder,
  getPurchaseOrderLines,
  issuePurchaseOrder,
  listPurchaseOrders,
  rejectPurchaseOrder,
  revisePurchaseOrder,
  submitPurchaseOrder,
  type ListPurchaseOrdersFilters,
  type PurchaseOrder,
} from "../api/purchase-orders.api";

/** `["procurement", "purchase-orders"]` — namespaced under `"procurement"`, same shape every other sub-domain hook in this feature folder already established. */
export const PURCHASE_ORDERS_QUERY_KEY = ["procurement", "purchase-orders"] as const;

function listKey(filters: ListPurchaseOrdersFilters) {
  return [...PURCHASE_ORDERS_QUERY_KEY, "list", filters.status, filters.supplierId] as const;
}

function detailKey(id: string | undefined) {
  return [...PURCHASE_ORDERS_QUERY_KEY, "detail", id] as const;
}

function linesKey(poId: string | undefined) {
  return [...PURCHASE_ORDERS_QUERY_KEY, "lines", poId] as const;
}

/** `procurement:po:create`-gated (reused for every GET — no separate view code exists, see `purchase-orders.api.ts`'s own doc comment). */
export function usePurchaseOrders(filters: ListPurchaseOrdersFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listPurchaseOrders(filters) });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getPurchaseOrder(id as string), enabled: !!id });
}

export function usePurchaseOrderLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => getPurchaseOrderLines(id as string), enabled: !!id });
}

/**
 * Used by `<PurchaseOrdersPage>` (unfiltered list page) to find whether a
 * given ISSUED/PARTIALLY_RECEIVED PO has already been revised — there is no
 * `supersededBy`/forward-pointer field on `PurchaseOrderResponseDto`, only
 * the backward `supersedesId`, and no dedicated "find the PO that supersedes
 * X" backend query exists (confirmed by reading `PurchaseOrdersController`
 * directly — `list()` only filters by `status`/`supplierId`). This scans the
 * already-cached unfiltered `usePurchaseOrders({})` result client-side — a
 * pragmatic choice for this dataset's real size in this app, documented here
 * rather than silently assumed cheap; a future part with a much larger PO
 * table should add a real `?supersedesId=` filter server-side instead.
 */
export function useSupersedingPurchaseOrder(originalId: string | undefined) {
  const allQuery = usePurchaseOrders({});
  const supersedingPo = originalId ? (allQuery.data ?? []).find((po) => po.supersedesId === originalId) : undefined;
  return { ...allQuery, data: supersedingPo };
}

function invalidatePurchaseOrderQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: linesKey(id) });
  }
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePurchaseOrderDto) => createPurchaseOrder(dto),
    onSuccess: (created) => invalidatePurchaseOrderQueries(queryClient, created.id),
  });
}

/** `procurement:po:create-direct`-gated — a real, expected 403 for roles that only have `procurement:po:create` (see `create-po-dialog.tsx`'s own doc comment on how that's surfaced). */
export function useCreatePurchaseOrderDirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePurchaseOrderDto) => createPurchaseOrderDirect(dto),
    onSuccess: (created) => invalidatePurchaseOrderQueries(queryClient, created.id),
  });
}

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitPurchaseOrder(id),
    onSuccess: (updated) => invalidatePurchaseOrderQueries(queryClient, updated.id),
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approvePurchaseOrder(id),
    onSuccess: (updated) => invalidatePurchaseOrderQueries(queryClient, updated.id),
  });
}

export function useRejectPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectPurchaseOrder(id),
    onSuccess: (updated) => invalidatePurchaseOrderQueries(queryClient, updated.id),
  });
}

/**
 * When `supersedesId` is present on the issued PO, this ALSO changes the
 * ORIGINAL PO's status to CANCELLED server-side in the same transaction (see
 * `purchase-orders.api.ts`'s own doc comment on `issuePurchaseOrder()`) — this
 * mutation invalidates BOTH the issued PO's own queries AND, when known, the
 * original's, so a still-open original detail view refreshes to CANCELLED
 * without a manual reload.
 */
export function useIssuePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; supersedesId?: string | null }) => issuePurchaseOrder(id),
    onSuccess: (updated, { supersedesId }) => {
      invalidatePurchaseOrderQueries(queryClient, updated.id);
      if (supersedesId) invalidatePurchaseOrderQueries(queryClient, supersedesId);
    },
  });
}

/** Response is the NEW superseding DRAFT PO, not the original — `<RevisePoDialog>` navigates to `response.id`'s own detail page on success. Invalidates the original's queries too (its status doesn't change yet at revise-time, but a future part reading `supersedesId`/history off it should see the fresh state regardless). */
export function useRevisePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RevisePurchaseOrderDto }) => revisePurchaseOrder(id, dto),
    onSuccess: (revised, { id }) => {
      invalidatePurchaseOrderQueries(queryClient, revised.id);
      invalidatePurchaseOrderQueries(queryClient, id);
    },
  });
}

export type { PurchaseOrder, PurchaseOrderLineResponseDto };
export type { PurchaseOrderStatus, ListPurchaseOrdersFilters } from "../api/purchase-orders.api";
export { isDraftPlaceholderNumber } from "../api/purchase-orders.api";
