"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRoleDto, RoleResponseDto, UpdateRoleDto } from "@klickit/contracts";
import { createRole, getRole, listRoles, updateRole } from "../api/roles.api";

export const ROLES_QUERY_KEY = ["roles"] as const;

function detailKey(id: string | undefined) {
  return [...ROLES_QUERY_KEY, "detail", id] as const;
}

/** `users:role:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useRoles() {
  return useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: listRoles });
}

export function useRole(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getRole(id as string), enabled: !!id });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleDto) => createRole(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY }),
  });
}

/** Diff-based submit at each call site (mirrors `useUpdateCustomField`/`useUpdateAcademicYear`) — invalidates both the list (badges/name/description shown there) and this role's own detail cache. */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRoleDto }) => updateRole(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export type { RoleResponseDto };
