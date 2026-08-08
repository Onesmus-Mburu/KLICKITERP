"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type {
  CashFlowResponse,
  CollectionRateResponse,
  CollectionTrendPoint,
  DefaultersCountResponse,
  IncomeVsExpensePoint,
  OutstandingFeesResponse,
  RefreshMvsResponse,
  RevenueExpenseSurplusResponse,
  TodaysCollectionResponse,
  TopDefaulterRow,
  WalletLiabilityResponse,
} from "@/types/dashboard";

/** All 10 real `DashboardController` endpoints (docs/phase-6/PROGRESS.md scope item 8) — every hook here is `dashboard:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched. */
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

/**
 * Phase 6 Slice 10 — an additive, optional `options.enabled` gate, same
 * shape `useStudents()`'s own `options?: {enabled?: boolean}` precedent
 * established (Slice 8 Part 1): defaults to `true` (byte-for-byte
 * unchanged behavior for every pre-existing call site that never passes
 * it). Used by `dashboard/page.tsx` to hold the MV-backed KPI queries
 * (`useOutstandingFees`/`useDefaultersCount`/`useTopDefaulters`/
 * `useRevenueExpenseSurplus`/`useWalletLiability`) until the page's own
 * mount-triggered `useRefreshDashboard()` mutation has settled —
 * `useTodaysCollection` (now a live query, not MV-backed) and
 * `useCollectionRate`/`useCollectionTrend`/`useCashFlow`/
 * `useIncomeVsExpense` deliberately do NOT get this option (see
 * `dashboard/page.tsx`'s own doc comment for which KPIs are MV-backed vs
 * live, and why the trend/chart queries don't need page-load gating even
 * though some of them do still read an MV).
 */
export interface DashboardQueryOptions {
  enabled?: boolean;
}

export function useTodaysCollection() {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "todays-collection"],
    queryFn: async () => unwrapApiResult<TodaysCollectionResponse>(await apiClient.GET("/api/v1/dashboard/todays-collection")),
  });
}

export function useOutstandingFees(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "outstanding-fees"],
    queryFn: async () => unwrapApiResult<OutstandingFeesResponse>(await apiClient.GET("/api/v1/dashboard/outstanding-fees")),
    enabled: options?.enabled ?? true,
  });
}

export function useCollectionRate(periodId: string | undefined) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "collection-rate", periodId],
    queryFn: async () =>
      unwrapApiResult<CollectionRateResponse>(
        await apiClient.GET("/api/v1/dashboard/collection-rate", { params: { query: { periodId: periodId as string } } }),
      ),
    enabled: !!periodId,
  });
}

export function useCashFlow(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "cash-flow", fromDate, toDate],
    queryFn: async () => unwrapApiResult<CashFlowResponse>(await apiClient.GET("/api/v1/dashboard/cash-flow", { params: { query: { fromDate, toDate } } })),
  });
}

export function useRevenueExpenseSurplus(periodId: string | undefined, options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "revenue-expense-surplus", periodId],
    queryFn: async () =>
      unwrapApiResult<RevenueExpenseSurplusResponse>(
        await apiClient.GET("/api/v1/dashboard/revenue-expense-surplus", { params: { query: { periodId: periodId as string } } }),
      ),
    enabled: !!periodId && (options?.enabled ?? true),
  });
}

export function useWalletLiability(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "wallet-liability"],
    queryFn: async () => unwrapApiResult<WalletLiabilityResponse>(await apiClient.GET("/api/v1/dashboard/wallet-liability")),
    enabled: options?.enabled ?? true,
  });
}

export function useDefaultersCount(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "defaulters-count"],
    queryFn: async () => unwrapApiResult<DefaultersCountResponse>(await apiClient.GET("/api/v1/dashboard/defaulters/count")),
    enabled: options?.enabled ?? true,
  });
}

export function useTopDefaulters(limit = 10, options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "defaulters-top", limit],
    queryFn: async () =>
      unwrapApiResult<TopDefaulterRow[]>(await apiClient.GET("/api/v1/dashboard/defaulters/top", { params: { query: { limit } } })),
    enabled: options?.enabled ?? true,
  });
}

export function useCollectionTrend(bucket: "day" | "week" | "month" | "term", fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "collection-trend", bucket, fromDate, toDate],
    queryFn: async () =>
      unwrapApiResult<CollectionTrendPoint[]>(
        await apiClient.GET("/api/v1/dashboard/charts/collection-trend", { params: { query: { bucket, fromDate, toDate } } }),
      ),
  });
}

export function useIncomeVsExpense(fromPeriodId: string | undefined, toPeriodId: string | undefined) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "income-vs-expense", fromPeriodId, toPeriodId],
    queryFn: async () =>
      unwrapApiResult<IncomeVsExpensePoint[]>(
        await apiClient.GET("/api/v1/dashboard/charts/income-vs-expense", {
          params: { query: { fromPeriodId: fromPeriodId as string, toPeriodId: toPeriodId as string } },
        }),
      ),
    enabled: !!fromPeriodId && !!toPeriodId,
  });
}

/** `POST /dashboard/refresh-mvs` — a real mutation invalidating every `["dashboard", ...]` query key on success, per docs/phase-6/PROGRESS.md scope item 8's "Refresh data" button. */
export function useRefreshDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapApiResult<RefreshMvsResponse>(await apiClient.POST("/api/v1/dashboard/refresh-mvs")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
