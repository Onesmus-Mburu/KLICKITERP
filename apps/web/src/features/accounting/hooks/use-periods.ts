"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PeriodResponseDto } from "@klickit/contracts";
import { getPeriod, hardClosePeriod, listPeriodsForFiscalYear, openPeriod, softClosePeriod } from "../api/fiscal-years.api";

export const PERIODS_QUERY_KEY = ["accounting", "periods"] as const;

function forYearKey(fiscalYearId: string | undefined) {
  return [...PERIODS_QUERY_KEY, "for-year", fiscalYearId] as const;
}

function detailKey(id: string | undefined) {
  return [...PERIODS_QUERY_KEY, "detail", id] as const;
}

/** `accounting:fiscal-year:view`-gated; ascending by `seq` (server-guaranteed) — the fiscal-year detail page's periods table. */
export function usePeriodsForFiscalYear(fiscalYearId: string | undefined) {
  return useQuery({
    queryKey: forYearKey(fiscalYearId),
    queryFn: () => listPeriodsForFiscalYear(fiscalYearId as string),
    enabled: !!fiscalYearId,
  });
}

export function usePeriod(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getPeriod(id as string), enabled: !!id });
}

/**
 * All 3 transition mutations are `accounting:period:manage`-gated and take
 * the SAME `{ id, fiscalYearId }` shape — `fiscalYearId` isn't sent to the
 * server (each transition endpoint only takes a path `id`), it's carried
 * purely so `onSuccess` can invalidate this period's parent year's list
 * (`forYearKey`) without a second round trip to look it up. Mirrors
 * `use-accounts.ts`'s own per-mutation invalidation shape.
 */
interface TransitionArgs {
  id: string;
  fiscalYearId: string;
}

function invalidatePeriodQueries(queryClient: ReturnType<typeof useQueryClient>, args: TransitionArgs) {
  queryClient.invalidateQueries({ queryKey: forYearKey(args.fiscalYearId) });
  queryClient.invalidateQueries({ queryKey: detailKey(args.id) });
}

/** Legal from OPEN or SOFT_CLOSED — rejected with a real 422 if the period is currently HARD_CLOSED ("hard close is final"). */
export function useOpenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: TransitionArgs) => openPeriod(id),
    onSuccess: (_data, args) => invalidatePeriodQueries(queryClient, args),
  });
}

/** Legal unless the period is currently HARD_CLOSED. */
export function useSoftClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: TransitionArgs) => softClosePeriod(id),
    onSuccess: (_data, args) => invalidatePeriodQueries(queryClient, args),
  });
}

/** Only legal when the period is ALREADY SOFT_CLOSED — the UI disables this action until then, but a 422 (race condition or direct API call) is still handled gracefully by the caller via `ApiError`. */
export function useHardClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: TransitionArgs) => hardClosePeriod(id),
    onSuccess: (_data, args) => invalidatePeriodQueries(queryClient, args),
  });
}

export type { PeriodResponseDto };
