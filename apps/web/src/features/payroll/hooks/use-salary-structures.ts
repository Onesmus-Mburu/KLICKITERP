"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePyrlSalaryStructureDto,
  PyrlSalaryStructureResponseDto,
  StructureComponentLineDto,
  StructureComponentLineResponseDto,
  UpdatePyrlSalaryStructureDto,
} from "@klickit/contracts";
import {
  addStructureLine,
  createSalaryStructure,
  getSalaryStructure,
  listSalaryStructures,
  listStructureLines,
  removeStructureLine,
  updateSalaryStructure,
  updateStructureLine,
} from "../api/salary-structures.api";

/** `["payroll", "salary-structures"]` query-key root, mirroring `use-components.ts`'s own `PAYROLL_COMPONENTS_QUERY_KEY` convention. */
export const PAYROLL_SALARY_STRUCTURES_QUERY_KEY = ["payroll", "salary-structures"] as const;

function listKey() {
  return [...PAYROLL_SALARY_STRUCTURES_QUERY_KEY, "list"] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_SALARY_STRUCTURES_QUERY_KEY, "detail", id] as const;
}

function linesKey(structureId: string | undefined) {
  return [...PAYROLL_SALARY_STRUCTURES_QUERY_KEY, structureId, "lines"] as const;
}

/** `payroll:structure:manage`-gated — the ONE shared permission every route on `SalaryStructuresController` uses, including this list (no filters at all — `list()` takes no query params, confirmed by reading the controller directly). */
export function useSalaryStructures() {
  return useQuery({ queryKey: listKey(), queryFn: () => listSalaryStructures() });
}

export function useSalaryStructure(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getSalaryStructure(id as string), enabled: !!id });
}

/** Backs the structure detail page's lines sub-table. */
export function useStructureLines(structureId: string | undefined) {
  return useQuery({ queryKey: linesKey(structureId), queryFn: () => listStructureLines(structureId as string), enabled: !!structureId });
}

/** Surfaces the real 409 from this part's own opportunistic backend fix (`name` uniqueness) verbatim via `ApiError.message` on a duplicate `name` — see `salary-structures.api.ts`'s own doc comment. */
export function useCreateSalaryStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlSalaryStructureDto) => createSalaryStructure(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey() }),
  });
}

export function useUpdateSalaryStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePyrlSalaryStructureDto }) => updateSalaryStructure(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/**
 * The 3 line mutations below all take the parent `structureId` explicitly
 * alongside whatever the real endpoint itself needs — mirrors
 * `use-budgets.ts`'s own `{ budgetId, ... }` shape for its own line
 * mutations (see that hook's own doc comment): `StructureComponentLineResponseDto`
 * itself always carries `structureId`, so add/update COULD read it off
 * their own response, but `removeStructureLine()`'s real response
 * (`{ removed: boolean }`) never does — applied consistently to all three
 * for symmetry rather than mixing two different invalidation strategies.
 */
function invalidateLines(queryClient: ReturnType<typeof useQueryClient>, structureId: string) {
  queryClient.invalidateQueries({ queryKey: linesKey(structureId) });
}

export function useAddStructureLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ structureId, dto }: { structureId: string; dto: StructureComponentLineDto }) => addStructureLine(structureId, dto),
    onSuccess: (_line, { structureId }) => invalidateLines(queryClient, structureId),
  });
}

export function useUpdateStructureLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, dto }: { structureId: string; lineId: string; dto: StructureComponentLineDto }) => updateStructureLine(lineId, dto),
    onSuccess: (_line, { structureId }) => invalidateLines(queryClient, structureId),
  });
}

export function useRemoveStructureLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId }: { structureId: string; lineId: string }) => removeStructureLine(lineId),
    onSuccess: (_result, { structureId }) => invalidateLines(queryClient, structureId),
  });
}

export type { PyrlSalaryStructureResponseDto, StructureComponentLineResponseDto };
