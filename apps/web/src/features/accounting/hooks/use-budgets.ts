"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BudgetLineInputDto, BudgetLineResponseDto, BudgetResponseDto, CreateBudgetDto, UpdateBudgetLineDto } from "@klickit/contracts";
import {
  activateBudget,
  addBudgetLine,
  createBudget,
  deleteBudgetLine,
  getBudget,
  getBudgetLines,
  listBudgets,
  rejectBudget,
  submitBudget,
  updateBudgetLine,
} from "../api/budgets.api";

export const BUDGETS_QUERY_KEY = ["accounting", "budgets"] as const;

function listKey(fiscalYearId: string | undefined) {
  return [...BUDGETS_QUERY_KEY, "list", fiscalYearId] as const;
}

function detailKey(id: string | undefined) {
  return [...BUDGETS_QUERY_KEY, "detail", id] as const;
}

function linesKey(budgetId: string | undefined) {
  return [...BUDGETS_QUERY_KEY, "lines", budgetId] as const;
}

/** `accounting:budget:manage`-gated; `fiscalYearId` is REQUIRED server-side (see `budgets.api.ts`'s own doc comment on `listBudgets()`) — this hook mirrors that by staying `enabled: false` until one is actually picked, backing the budgets list page's fiscal-year-scoped table (and `budget-status-actions.tsx`'s own "is there already an ACTIVE budget for this fiscal year" pre-flight check). */
export function useBudgets(fiscalYearId: string | undefined) {
  return useQuery({ queryKey: listKey(fiscalYearId), queryFn: () => listBudgets(fiscalYearId as string), enabled: !!fiscalYearId });
}

export function useBudget(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getBudget(id as string), enabled: !!id });
}

/** Backs the budget detail page's lines table AND its own "total annual amount" display — the total is computed client-side by summing this query's own data (`budgetLineRowsTotal`-style, via `sumMoneyStrings`), so invalidating this one key is enough to refresh both at once, no separate "total" query exists server-side. */
export function useBudgetLines(budgetId: string | undefined) {
  return useQuery({ queryKey: linesKey(budgetId), queryFn: () => getBudgetLines(budgetId as string), enabled: !!budgetId });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBudgetDto) => createBudget(dto),
    onSuccess: (created) => queryClient.invalidateQueries({ queryKey: listKey(created.fiscalYearId) }),
  });
}

function invalidateBudgetDetail(queryClient: ReturnType<typeof useQueryClient>, budgetId: string) {
  queryClient.invalidateQueries({ queryKey: detailKey(budgetId) });
  queryClient.invalidateQueries({ queryKey: linesKey(budgetId) });
}

/**
 * The 3 line mutations below all take the parent `budgetId` explicitly
 * alongside whatever the real endpoint itself needs — mirrors
 * `use-periods.ts`'s own `{ id, fiscalYearId }` shape (see that hook's own
 * doc comment): `BudgetLineResponseDto` itself always carries `budgetId`, so
 * add/update COULD read it off their own response, but `removeLine()`'s real
 * response (`{ deleted: boolean }`) never does — this shape is required for
 * that one regardless, and applied consistently to all three for symmetry
 * rather than mixing two different invalidation strategies in one file.
 * Every one of these invalidates BOTH the lines list and the budget detail
 * query (`invalidateBudgetDetail`) — the detail page's own "total annual
 * amount" is derived from the lines list, not a separate field on the
 * budget itself, but invalidating both keeps this correct even if a future
 * caller reads totals off the detail query instead.
 */
export function useAddBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ budgetId, dto }: { budgetId: string; dto: BudgetLineInputDto }) => addBudgetLine(budgetId, dto),
    onSuccess: (_line, { budgetId }) => invalidateBudgetDetail(queryClient, budgetId),
  });
}

export function useUpdateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, dto }: { budgetId: string; lineId: string; dto: UpdateBudgetLineDto }) => updateBudgetLine(lineId, dto),
    onSuccess: (_line, { budgetId }) => invalidateBudgetDetail(queryClient, budgetId),
  });
}

export function useDeleteBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId }: { budgetId: string; lineId: string }) => deleteBudgetLine(lineId),
    onSuccess: (_result, { budgetId }) => invalidateBudgetDetail(queryClient, budgetId),
  });
}

/** `accounting:budget:submit`-gated. See `budgets.api.ts`'s own doc comment on `submitBudget()` for the "no `GL_BUDGET` workflow registered" 422 this can hit on a fresh install — `budget-status-actions.tsx` is the caller responsible for surfacing that gracefully. Also invalidates the fiscal year's budgets list (the row's own status badge changes). */
export function useSubmitBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitBudget(id),
    onSuccess: (updated) => {
      invalidateBudgetDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: listKey(updated.fiscalYearId) });
    },
  });
}

/** Also invalidates the fiscal year's whole budgets list, not just this budget's own detail — activating this one may have superseded a DIFFERENT budget in the same list server-side (see `activateBudget()`'s own doc comment), and that sibling's status badge needs to refresh too. */
export function useActivateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateBudget(id),
    onSuccess: (updated) => {
      invalidateBudgetDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: listKey(updated.fiscalYearId) });
    },
  });
}

export function useRejectBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectBudget(id),
    onSuccess: (updated) => {
      invalidateBudgetDetail(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: listKey(updated.fiscalYearId) });
    },
  });
}

export type { BudgetResponseDto, BudgetLineResponseDto };
