"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { FiscalYearResponseDto, PeriodResponseDto } from "@klickit/contracts";

/**
 * FLAGGED DECISION #3 (docs/phase-6/PROGRESS.md): the dashboard's
 * period-scoped endpoints (`collection-rate`, `revenue-expense-surplus`,
 * `charts/income-vs-expense`) need a `periodId`/`fromPeriodId`/`toPeriodId`
 * and this slice builds no dedicated period-management screen. The only
 * period data cheaply available is `accounting`'s own real
 * `GET /accounting/fiscal-years` + `GET /accounting/fiscal-years/{id}/periods`
 * (confirmed via `packages/contracts` — no other/cheaper period-listing
 * endpoint exists). Resolution used here: pick the fiscal year with
 * `status === "OPEN"` (falling back to the most recently started one if
 * none is OPEN), list its periods, and resolve "current" as the period
 * whose `[startsOn, endsOn]` window contains today — falling back to the
 * most recent `OPEN` period, then simply the last period in the list.
 */
export function useFiscalYears() {
  return useQuery({
    queryKey: ["accounting", "fiscal-years"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/v1/accounting/fiscal-years");
      return unwrapApiResult<FiscalYearResponseDto[]>(result);
    },
    staleTime: 5 * 60_000,
  });
}

export function useCurrentFiscalYear() {
  const query = useFiscalYears();
  const fiscalYears = query.data ?? [];
  const current =
    fiscalYears.find((fy) => fy.status === "OPEN") ??
    [...fiscalYears].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ??
    null;
  return { ...query, currentFiscalYear: current };
}

export function usePeriods(fiscalYearId: string | undefined) {
  return useQuery({
    queryKey: ["accounting", "fiscal-years", fiscalYearId, "periods"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/v1/accounting/fiscal-years/{id}/periods", {
        params: { path: { id: fiscalYearId as string } },
      });
      return unwrapApiResult<PeriodResponseDto[]>(result);
    },
    enabled: !!fiscalYearId,
    staleTime: 5 * 60_000,
  });
}

export function resolveCurrentPeriod(periods: PeriodResponseDto[]): PeriodResponseDto | null {
  if (periods.length === 0) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const containing = periods.find((p) => p.startsOn <= todayIso && todayIso <= p.endsOn);
  if (containing) return containing;
  const open = [...periods].filter((p) => p.status === "OPEN").sort((a, b) => b.seq - a.seq)[0];
  if (open) return open;
  return [...periods].sort((a, b) => b.seq - a.seq)[0];
}

/**
 * Combines the two calls above into the one thing dashboard widgets
 * actually need: the current fiscal year's period list plus the resolved
 * "current" period.
 */
export function useCurrentPeriodContext() {
  const fyQuery = useCurrentFiscalYear();
  const periodsQuery = usePeriods(fyQuery.currentFiscalYear?.id);
  const periods = periodsQuery.data ?? [];
  const currentPeriod = resolveCurrentPeriod(periods);

  return {
    isLoading: fyQuery.isLoading || periodsQuery.isLoading,
    isError: fyQuery.isError || periodsQuery.isError,
    periods,
    currentPeriod,
  };
}
