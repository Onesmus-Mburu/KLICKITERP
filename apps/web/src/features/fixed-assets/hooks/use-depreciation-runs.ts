"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFaDepreciationRunDto, DecideFaDepreciationRunDto, FaDepreciationLineResponseDto, FaDepreciationRunResponseDto } from "@klickit/contracts";
import {
  createDepreciationRun,
  decideDepreciationRun,
  getDepreciationRun,
  listDepreciationRunLines,
  listDepreciationRuns,
  postDepreciationRun,
  submitDepreciationRun,
  type ListFaDepreciationRunsParams,
} from "../api/depreciation-runs.api";
import { FIXED_ASSETS_ASSETS_QUERY_KEY } from "./use-assets";

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — `["fixed-assets",
 * "depreciation-runs"]` query-key root, the same "one shared feature root,
 * namespaced query keys per sub-domain" shape `use-categories.ts`/
 * `use-assets.ts` already establish. Lines are keyed under the run's own
 * detail key (`[...detailKey(id), "lines"]`) since they're always fetched in
 * the context of one specific run, never independently — mirrors
 * `use-payroll-runs.ts`'s own `linesKey()` shape.
 */
export const FIXED_ASSETS_DEPRECIATION_RUNS_QUERY_KEY = ["fixed-assets", "depreciation-runs"] as const;

function listKey(params: ListFaDepreciationRunsParams) {
  return [...FIXED_ASSETS_DEPRECIATION_RUNS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...FIXED_ASSETS_DEPRECIATION_RUNS_QUERY_KEY, "detail", id] as const;
}

function linesKey(id: string | undefined) {
  return [...detailKey(id), "lines"] as const;
}

/** `fixed-assets:depreciation:run`-gated. */
export function useDepreciationRuns(params: ListFaDepreciationRunsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listDepreciationRuns(params) });
}

export function useDepreciationRun(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getDepreciationRun(id as string), enabled: !!id });
}

export function useDepreciationRunLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listDepreciationRunLines(id as string), enabled: !!id });
}

/**
 * Every lifecycle mutation invalidates the run list AND this run's own
 * detail + lines — a status transition always changes the run's own
 * `status`/`approvalRef`/`journalId`, the same "invalidate broadly rather
 * than track exactly which subset each call site needs" discipline
 * `use-payroll-runs.ts`'s own `invalidateRunQueries()` already establishes.
 */
function invalidateRunQueries(queryClient: ReturnType<typeof useQueryClient>, run: FaDepreciationRunResponseDto) {
  queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_DEPRECIATION_RUNS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(run.id) });
  queryClient.invalidateQueries({ queryKey: linesKey(run.id) });
}

export function useCreateDepreciationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaDepreciationRunDto) => createDepreciationRun(dto),
    onSuccess: (created) => invalidateRunQueries(queryClient, created),
  });
}

export function useSubmitDepreciationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitDepreciationRun(id),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

export function useDecideDepreciationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideFaDepreciationRunDto }) => decideDepreciationRun(id, dto),
    onSuccess: (updated) => invalidateRunQueries(queryClient, updated),
  });
}

/**
 * `post()` genuinely mutates every affected asset's OWN `accumDepreciation`
 * as a side effect (see `depreciation-runs.service.ts`'s own doc comment) —
 * this is the ONE mutation in this file that also invalidates
 * `FIXED_ASSETS_ASSETS_QUERY_KEY` (Part 1's own asset list/detail queries),
 * the same "a write here changes another feature's own cached data" pattern
 * `use-transfers.ts`/`use-maintenance.ts` already established in Part 2 for
 * their own asset-field-mutating calls.
 */
export function usePostDepreciationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postDepreciationRun(id),
    onSuccess: (updated) => {
      invalidateRunQueries(queryClient, updated);
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

export type { FaDepreciationLineResponseDto, FaDepreciationRunResponseDto };
