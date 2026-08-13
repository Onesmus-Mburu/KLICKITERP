"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRequisitionDto, CreateRequisitionLineDto, RequisitionLineResponseDto, RequisitionResponseDto, UpdateRequisitionLineDto } from "@klickit/contracts";
import {
  addRequisitionLine,
  approveRequisition,
  cancelRequisition,
  createRequisition,
  deleteRequisitionLine,
  getRequisition,
  getRequisitionLines,
  listRequisitions,
  rejectRequisition,
  submitRequisition,
  updateRequisitionLine,
  type ListRequisitionsFilters,
} from "../api/requisitions.api";

/** `["procurement", "requisitions"]` — namespaced under `"procurement"` alongside `SUPPLIERS_QUERY_KEY` (Part 1), the same "one shared feature root, namespaced query keys per sub-domain" shape `features/accounting/hooks/*.ts` already established. */
export const REQUISITIONS_QUERY_KEY = ["procurement", "requisitions"] as const;

function listKey(filters: ListRequisitionsFilters) {
  return [...REQUISITIONS_QUERY_KEY, "list", filters.status, filters.departmentId] as const;
}

function detailKey(id: string | undefined) {
  return [...REQUISITIONS_QUERY_KEY, "detail", id] as const;
}

function linesKey(requisitionId: string | undefined) {
  return [...REQUISITIONS_QUERY_KEY, "lines", requisitionId] as const;
}

/** `procurement:requisition:view`-gated. */
export function useRequisitions(filters: ListRequisitionsFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listRequisitions(filters) });
}

export function useRequisition(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getRequisition(id as string), enabled: !!id });
}

/** Backs both the detail page's lines table AND, indirectly, its "total estimate" display — the total itself is read straight off `requisition.totalEstimate` (server-recomputed after every line mutation), not summed client-side from this query's own data — see `<RequisitionLineEditor>`'s own doc comment for why. */
export function useRequisitionLines(requisitionId: string | undefined) {
  return useQuery({ queryKey: linesKey(requisitionId), queryFn: () => getRequisitionLines(requisitionId as string), enabled: !!requisitionId });
}

export function useCreateRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRequisitionDto) => createRequisition(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REQUISITIONS_QUERY_KEY }),
  });
}

function invalidateRequisitionDetail(queryClient: ReturnType<typeof useQueryClient>, requisitionId: string) {
  queryClient.invalidateQueries({ queryKey: detailKey(requisitionId) });
  queryClient.invalidateQueries({ queryKey: linesKey(requisitionId) });
}

/**
 * The 3 line mutations below all take the parent `requisitionId` explicitly
 * alongside whatever the real endpoint itself needs — mirrors
 * `use-budgets.ts`'s own `{budgetId, ...}` shape (see that hook's own doc
 * comment): `RequisitionLineResponseDto` itself always carries
 * `requisitionId`, so add/update COULD read it off their own response, but
 * `deleteRequisitionLine()`'s real response (`{deleted: boolean}`) never
 * does — this shape is required for that one regardless, applied
 * consistently to all three for symmetry. Every one of these invalidates
 * BOTH the lines list and the requisition detail query — `totalEstimate` on
 * the requisition itself changes server-side after every line mutation
 * (`RequisitionsService.recomputeTotalEstimate()`), so the detail query
 * needs to refresh too, not just the lines list.
 */
export function useAddRequisitionLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requisitionId, dto }: { requisitionId: string; dto: CreateRequisitionLineDto }) => addRequisitionLine(requisitionId, dto),
    onSuccess: (_line, { requisitionId }) => invalidateRequisitionDetail(queryClient, requisitionId),
  });
}

export function useUpdateRequisitionLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, dto }: { requisitionId: string; lineId: string; dto: UpdateRequisitionLineDto }) => updateRequisitionLine(lineId, dto),
    onSuccess: (_line, { requisitionId }) => invalidateRequisitionDetail(queryClient, requisitionId),
  });
}

export function useDeleteRequisitionLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId }: { requisitionId: string; lineId: string }) => deleteRequisitionLine(lineId),
    onSuccess: (_result, { requisitionId }) => invalidateRequisitionDetail(queryClient, requisitionId),
  });
}

/** `procurement:requisition:submit`-gated. See `requisitions.api.ts`'s own doc comment on `submitRequisition()` for the possible "no lines"/"no workflow configured" 422s — `<RequisitionStatusActions>` is the caller responsible for surfacing both gracefully. Also invalidates the whole requisitions list (the row's own status badge changes). */
export function useSubmitRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitRequisition(id),
    onSuccess: (updated) => {
      invalidateRequisitionDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: REQUISITIONS_QUERY_KEY });
    },
  });
}

/** `procurement:requisition:decide`-gated. */
export function useApproveRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveRequisition(id),
    onSuccess: (updated) => {
      invalidateRequisitionDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: REQUISITIONS_QUERY_KEY });
    },
  });
}

/** `procurement:requisition:decide`-gated. */
export function useRejectRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectRequisition(id),
    onSuccess: (updated) => {
      invalidateRequisitionDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: REQUISITIONS_QUERY_KEY });
    },
  });
}

export function useCancelRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelRequisition(id),
    onSuccess: (updated) => {
      invalidateRequisitionDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: REQUISITIONS_QUERY_KEY });
    },
  });
}

export type { RequisitionResponseDto, RequisitionLineResponseDto };
