"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePyrlRunDto, DecidePyrlRunDto, PayPyrlRunDto, PyrlRunResponseDto } from "@klickit/contracts";
import {
  commitRun,
  computeRun,
  createRun,
  decideRun,
  fileRun,
  getRun,
  listRunLineComponents,
  listRunLines,
  listRuns,
  payRun,
  reviewRun,
  submitRun,
  type ListPyrlRunsParams,
} from "../api/payroll-runs.api";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — `["payroll", "runs"]`
 * query-key root, the same namespaced-under-`"payroll"` shape every prior
 * part's own hook file establishes. Lines are keyed under the run's own
 * detail key (`[...detailKey(id), "lines"]`) since they're always fetched in
 * the context of one specific run, never independently.
 */
export const PAYROLL_RUNS_QUERY_KEY = ["payroll", "runs"] as const;

function listKey(params: ListPyrlRunsParams) {
  return [...PAYROLL_RUNS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_RUNS_QUERY_KEY, "detail", id] as const;
}

function linesKey(id: string | undefined) {
  return [...detailKey(id), "lines"] as const;
}

function lineComponentsKey(lineId: string | undefined) {
  return [...PAYROLL_RUNS_QUERY_KEY, "lineComponents", lineId] as const;
}

/** `payroll:run:view`-gated — a real, dedicated read permission (unlike Loans' reused-create-permission pattern), confirmed by reading the controller directly. */
export function useRuns(params: ListPyrlRunsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listRuns(params) });
}

export function useRun(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getRun(id as string), enabled: !!id });
}

export function useRunLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listRunLines(id as string), enabled: !!id });
}

/** No call site in this part — wired for Part 7's own payslip-line-breakdown view to reuse directly, see `payroll-runs.api.ts`'s own doc comment. */
export function useRunLineComponents(lineId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: lineComponentsKey(lineId),
    queryFn: () => listRunLineComponents(lineId as string),
    enabled: !!lineId && (options.enabled ?? true),
  });
}

/**
 * Every mutation below invalidates the run list AND this run's own detail +
 * lines — a lifecycle action always changes the run's own status/totals, and
 * `compute()` always rebuilds the lines wholesale, so invalidating both
 * unconditionally is simpler and safer than tracking exactly which subset
 * each call site needs, the same discipline `use-loans.ts`'s own
 * `invalidateLoanQueries()` already establishes for Part 5.
 */
function invalidateRunQueries(queryClient: ReturnType<typeof useQueryClient>, run: PyrlRunResponseDto) {
  queryClient.invalidateQueries({ queryKey: PAYROLL_RUNS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(run.id) });
  queryClient.invalidateQueries({ queryKey: linesKey(run.id) });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlRunDto) => createRun(dto),
    onSuccess: (created) => invalidateRunQueries(queryClient, created),
  });
}

/** Covers both the first Compute AND every subsequent Recompute — the same endpoint, same real wipe-and-rebuild behavior each call, see `payroll-runs.api.ts`'s own doc comment. */
export function useComputeRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => computeRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function useReviewRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reviewRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function useSubmitRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function useDecideRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecidePyrlRunDto }) => decideRun(id, dto),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

/**
 * Phase 6 Slice 22 Part 7 (Payroll, Module 15) — `commit -> pay -> file`, the
 * 3 mutations completing this lifecycle. Each invalidates the same
 * run-list + detail + lines shape every earlier lifecycle mutation above
 * already does — `commit()`/`pay()` also change every line's own fields
 * (`loanRecovered`'s implications aside, `pay()` writes `paidVia`/`paidAt`
 * directly onto each line), so re-fetching lines is required, not just
 * defensive.
 */
export function useCommitRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commitRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function usePayRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: PayPyrlRunDto }) => payRun(id, dto),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function useFileRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fileRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export type { PyrlRunResponseDto };
