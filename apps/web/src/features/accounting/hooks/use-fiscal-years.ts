"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFiscalYearDto, FiscalYearResponseDto } from "@klickit/contracts";
import { createFiscalYear, getFiscalYear, listFiscalYears } from "../api/fiscal-years.api";

export const FISCAL_YEARS_QUERY_KEY = ["accounting", "fiscal-years"] as const;

function detailKey(id: string | undefined) {
  return [...FISCAL_YEARS_QUERY_KEY, "detail", id] as const;
}

/** `accounting:fiscal-year:view`-gated; backs the Fiscal Years list page. */
export function useFiscalYears() {
  return useQuery({ queryKey: FISCAL_YEARS_QUERY_KEY, queryFn: listFiscalYears });
}

/** Backs the fiscal-year detail page's header card (name/range/status). */
export function useFiscalYear(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getFiscalYear(id as string), enabled: !!id });
}

/** `accounting:fiscal-year:manage`-gated; auto-generates the year's periods server-side in the same transaction — no separate "create periods" call needed, so this invalidates only the fiscal-years list (the periods list is a distinct query key, `use-periods.ts`'s own `usePeriodsForFiscalYear`, only ever populated AFTER navigating to a newly-created year's detail page — nothing to invalidate there yet). */
export function useCreateFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFiscalYearDto) => createFiscalYear(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FISCAL_YEARS_QUERY_KEY }),
  });
}

export type { FiscalYearResponseDto };
