"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryObserverResult } from "@tanstack/react-query";
import type { PermissionResponseDto } from "@klickit/contracts";
import { grantPermission, listRolePermissions, revokePermission } from "../api/roles.api";
import { usePermissions } from "./use-permissions";

export const ROLE_PERMISSIONS_QUERY_KEY = ["roles", "permissions"] as const;

function rolePermissionsKey(roleId: string | undefined) {
  return [...ROLE_PERMISSIONS_QUERY_KEY, roleId] as const;
}

/** `users:role:view`-gated; the currently-granted permission set for one role (`GET /roles/:id/permissions`). */
export function useRolePermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: rolePermissionsKey(roleId),
    queryFn: () => listRolePermissions(roleId as string),
    enabled: !!roleId,
  });
}

/** `users:role:assign-permission`-gated. Rejected (422) if the role is auditor-class and the permission is_write=true (BR-SEC-04), or if the grant would violate an enabled SoD pair — callers surface `ApiError.message` verbatim, not a generic fallback, since that real server message is the useful information here. */
export function useGrantPermission(roleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionCode: string) => grantPermission(roleId, permissionCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolePermissionsKey(roleId) }),
  });
}

export function useRevokePermission(roleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionCode: string) => revokePermission(roleId, permissionCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolePermissionsKey(roleId) }),
  });
}

export interface PermissionWithGrantState {
  permission: PermissionResponseDto;
  granted: boolean;
}

/**
 * Client-side join, same shape/reasoning as
 * `features/students/hooks/use-guardians.ts`'s `useStudentGuardians()`
 * (read first, before writing this, as the established precedent for
 * combining two independent queries into one `<QueryBoundary>`-compatible
 * pseudo-query): the Role detail page needs BOTH "the catalogue rows for
 * the selected module" (`usePermissions(module)`) AND "which codes this
 * role currently has" (`useRolePermissions(roleId)`) before it can render a
 * single checkbox's checked state correctly, so this hook waits on both and
 * exposes one `data: PermissionWithGrantState[]` array — shaped to match
 * `QueryBoundaryProps<T>["query"]` exactly, so `<QueryBoundary
 * query={useRolePermissionsForModule(...)}>` works unmodified, same as
 * every single-query hook elsewhere in this app.
 */
export function useRolePermissionsForModule(roleId: string | undefined, module: string | undefined) {
  const permissionsQuery = usePermissions(module);
  const rolePermissionsQuery = useRolePermissions(roleId);

  const data = React.useMemo<PermissionWithGrantState[] | undefined>(() => {
    if (!permissionsQuery.data || !rolePermissionsQuery.data) return undefined;
    const grantedCodes = new Set(rolePermissionsQuery.data.map((p) => p.code));
    return permissionsQuery.data.map((permission) => ({ permission, granted: grantedCodes.has(permission.code) }));
  }, [permissionsQuery.data, rolePermissionsQuery.data]);

  const refetch = React.useCallback(async (): Promise<QueryObserverResult<PermissionWithGrantState[], unknown>> => {
    const [permissionsResult] = await Promise.all([permissionsQuery.refetch(), rolePermissionsQuery.refetch()]);
    // `<QueryBoundary>` only calls `query.refetch()` to trigger a re-fetch and
    // discards its return value — both underlying queries have already
    // genuinely refetched above by the time this resolves; this cast only
    // satisfies `UseQueryResult`'s return shape at the type level, mirroring
    // `useStudentGuardians()`'s own identical cast + doc comment.
    return permissionsResult as unknown as QueryObserverResult<PermissionWithGrantState[], unknown>;
  }, [permissionsQuery, rolePermissionsQuery]);

  return {
    data,
    isPending: permissionsQuery.isPending || rolePermissionsQuery.isPending,
    isError: permissionsQuery.isError || rolePermissionsQuery.isError,
    error: permissionsQuery.error ?? rolePermissionsQuery.error,
    refetch,
  };
}
