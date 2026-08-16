"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePyrlComponentDto, PyrlComponentResponseDto, UpdatePyrlComponentDto } from "@klickit/contracts";
import { createComponent, getComponent, listComponents, updateComponent, type ListPyrlComponentsParams } from "../api/components.api";

/** `["payroll", "components"]` query-key root, mirroring `use-employees.ts`'s own `PAYROLL_EMPLOYEES_QUERY_KEY` convention. */
export const PAYROLL_COMPONENTS_QUERY_KEY = ["payroll", "components"] as const;

function listKey(params: ListPyrlComponentsParams) {
  return [...PAYROLL_COMPONENTS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_COMPONENTS_QUERY_KEY, "detail", id] as const;
}

/** `payroll:component:manage`-gated — the ONE shared permission every route on `ComponentsController` uses, including this list (see `components.api.ts`'s own doc comment). */
export function useComponents(params: ListPyrlComponentsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listComponents(params) });
}

export function useComponent(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getComponent(id as string), enabled: !!id });
}

function invalidateComponentQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: PAYROLL_COMPONENTS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

/** Surfaces the real 409 from this part's own opportunistic backend fix (`code` uniqueness) verbatim via `ApiError.message` on a duplicate `code` — see `components.api.ts`'s own doc comment. */
export function useCreateComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlComponentDto) => createComponent(dto),
    onSuccess: () => invalidateComponentQueries(queryClient),
  });
}

export function useUpdateComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePyrlComponentDto }) => updateComponent(id, dto),
    onSuccess: (updated) => invalidateComponentQueries(queryClient, updated.id),
  });
}

export type { PyrlComponentResponseDto };
