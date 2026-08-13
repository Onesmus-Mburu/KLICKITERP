"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateQuotationDto, QuotationLineResponseDto, QuotationResponseDto } from "@klickit/contracts";
import { awardQuotation, createQuotation, getQuotation, getQuotationLines, listQuotationsByRequisition } from "../api/quotations.api";

/** `["procurement", "quotations"]` — namespaced under `"procurement"` alongside `SUPPLIERS_QUERY_KEY`/`REQUISITIONS_QUERY_KEY`, the same shape this feature folder already established in Parts 1-2. */
export const QUOTATIONS_QUERY_KEY = ["procurement", "quotations"] as const;

function listKey(requisitionId: string | undefined) {
  return [...QUOTATIONS_QUERY_KEY, "list", requisitionId] as const;
}

function detailKey(id: string | undefined) {
  return [...QUOTATIONS_QUERY_KEY, "detail", id] as const;
}

function linesKey(quotationId: string | undefined) {
  return [...QUOTATIONS_QUERY_KEY, "lines", quotationId] as const;
}

/** `procurement:quotation:manage`-gated (bundles view). `requisitionId` is REQUIRED on the real endpoint — this hook mirrors that, `enabled` only once a real id is known. */
export function useQuotationsByRequisition(requisitionId: string | undefined) {
  return useQuery({
    queryKey: listKey(requisitionId),
    queryFn: () => listQuotationsByRequisition(requisitionId as string),
    enabled: !!requisitionId,
  });
}

export function useQuotation(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getQuotation(id as string), enabled: !!id });
}

export function useQuotationLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => getQuotationLines(id as string), enabled: !!id });
}

/** Invalidates the requisition-scoped list (the new quote must show up on `<QuotationComparison>`) — the mutation's own caller already knows `requisitionId`, so this is threaded through explicitly rather than read back off the response. */
export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateQuotationDto) => createQuotation(dto),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: listKey(created.requisitionId) });
    },
  });
}

/**
 * `award()` can genuinely 409 (a real DB unique-violation, `uq_proc_quotation_award_p`
 * — at most one awarded quotation per requisition) — this mutation does NOT
 * swallow or special-case that here; `quotation-comparison.tsx`'s own
 * `handleAward()` is the one place that turns a 409 into an honest message,
 * matching this codebase's established "the component owns user-facing error
 * copy, the hook stays a thin mutation wrapper" split.
 */
export function useAwardQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, awardReason }: { id: string; awardReason: string }) => awardQuotation(id, awardReason),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: listKey(updated.requisitionId) });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export type { QuotationResponseDto, QuotationLineResponseDto };
