"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePyrlOneoffDto, PyrlOneoffResponseDto, UpdatePyrlOneoffDto } from "@klickit/contracts";
import { createOneoff, deleteOneoff, getOneoff, listOneoffsByPeriod, updateOneoff } from "../api/oneoffs.api";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — `["payroll", "oneoffs"]`
 * query-key root. `useOneoffsByPeriod()` is this part's real UI's only list
 * hook — the run detail page's one-offs panel is period-scoped (see
 * `run-oneoffs-panel.tsx`), matching `GET /payroll/oneoffs?periodKey=`'s own
 * "every one-off queued for a period, across every employee" behavior.
 */
export const PAYROLL_ONEOFFS_QUERY_KEY = ["payroll", "oneoffs"] as const;

function periodListKey(periodKey: string | undefined) {
  return [...PAYROLL_ONEOFFS_QUERY_KEY, "period", periodKey] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_ONEOFFS_QUERY_KEY, "detail", id] as const;
}

export function useOneoffsByPeriod(periodKey: string | undefined) {
  return useQuery({ queryKey: periodListKey(periodKey), queryFn: () => listOneoffsByPeriod(periodKey as string), enabled: !!periodKey });
}

export function useOneoff(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getOneoff(id as string), enabled: !!id });
}

function invalidateOneoffQueries(queryClient: ReturnType<typeof useQueryClient>, oneoff: PyrlOneoffResponseDto) {
  queryClient.invalidateQueries({ queryKey: periodListKey(oneoff.periodKey) });
  queryClient.invalidateQueries({ queryKey: detailKey(oneoff.id) });
}

export function useCreateOneoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlOneoffDto) => createOneoff(dto),
    onSuccess: (created) => invalidateOneoffQueries(queryClient, created),
  });
}

export function useUpdateOneoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePyrlOneoffDto }) => updateOneoff(id, dto),
    onSuccess: (updated) => invalidateOneoffQueries(queryClient, updated),
  });
}

/** `deleteOneoff()` returns `{removed}`, not the deleted row — invalidates by the (id, periodKey) the caller already has in hand rather than the response. */
export function useDeleteOneoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; periodKey: string }) => deleteOneoff(id),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: periodListKey(variables.periodKey) });
      queryClient.invalidateQueries({ queryKey: detailKey(variables.id) });
    },
  });
}

export type { PyrlOneoffResponseDto };
