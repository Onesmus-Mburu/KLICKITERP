"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDepartmentDto, DepartmentResponseDto, UpdateDepartmentDto } from "@klickit/contracts";
import { createDepartment, getDepartment, listDepartments, updateDepartment } from "../api/departments.api";

/** `["departments"]` query-key convention mirrors `features/roles/hooks/use-roles.ts`'s own `ROLES_QUERY_KEY`. */
export const DEPARTMENTS_QUERY_KEY = ["departments"] as const;

function detailKey(id: string | undefined) {
  return [...DEPARTMENTS_QUERY_KEY, "detail", id] as const;
}

/** `users:department:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useDepartments() {
  return useQuery({ queryKey: DEPARTMENTS_QUERY_KEY, queryFn: listDepartments });
}

export function useDepartment(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getDepartment(id as string), enabled: !!id });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDepartmentDto) => createDepartment(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY }),
  });
}

/** Diff-based submit at each call site (mirrors `useUpdateRole`/`useUpdateCustomField`) — invalidates both the list (name/head shown there) and this department's own detail cache. */
export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateDepartmentDto }) => updateDepartment(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export type { DepartmentResponseDto };
