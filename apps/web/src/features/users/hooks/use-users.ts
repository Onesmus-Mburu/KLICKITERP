"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignDepartmentDto, CreateUserDto, SetAuthorityLimitDto, UpdateUserDto } from "@klickit/contracts";
import {
  assignDepartment,
  assignRoleToUser,
  createUser,
  deactivateUser,
  getUser,
  listUserRoles,
  listUsers,
  reactivateUser,
  setAuthorityLimit,
  suspendUser,
  unassignRoleFromUser,
  updateUser,
  type ListUsersParams,
} from "../api/users.api";

/** `["users"]` query-key convention, mirroring `features/roles/hooks/use-roles.ts`'s `ROLES_QUERY_KEY`/`features/wallet/hooks/use-wallets.ts`'s `listKey`/`detailKey` shape. */
export const USERS_QUERY_KEY = ["users"] as const;

function listKey(params: ListUsersParams) {
  return [...USERS_QUERY_KEY, "list", params] as const;
}
function detailKey(id: string | undefined) {
  return [...USERS_QUERY_KEY, "detail", id] as const;
}
function rolesKey(userId: string | undefined) {
  return [...USERS_QUERY_KEY, "roles", userId] as const;
}

/** `users:user:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. `params` is the whole query key (mirrors `useWallets()`/`useStudents()`'s own convention) — a page/pageSize/departmentId/status change is genuinely a different query, correctly cache-keyed rather than silently reusing a stale entry. */
export function useUsers(params: ListUsersParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listUsers(params) });
}

export function useUser(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getUser(id as string), enabled: !!id });
}

/**
 * `POST /users` — `{user, temporaryPassword}`. The plaintext temp password
 * lives ONLY in this mutation's returned data (`useMutation` never writes
 * its result into the TanStack Query CACHE — only `data`/`mutateAsync`'s
 * resolved value carry it) — the create-user page reads it once, off this
 * hook's own return value, into local component state, and it is never
 * persisted anywhere beyond that (no `setQueryData`, no localStorage). This
 * mutation only invalidates the LIST query — there is no detail-query cache
 * entry yet for a brand-new user id.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserDto) => createUser(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

/** Diff-based submit at the call site (mirrors `useUpdateRole`/`useUpdateDepartment`) — invalidates both the list (columns shown there) and this user's own detail cache. */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateUserDto }) => updateUser(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/**
 * The 3 real no-body state-machine transitions (`users:user:suspend`/
 * `:reactivate`/`:deactivate`) — each invalidates BOTH the list (status
 * column) and this user's own detail cache on success, per the plan's
 * explicit instruction.
 */
export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => suspendUser(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateUser(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/** `users:user:assign-department`-gated — invalidates list (department column) + detail, per the plan's explicit instruction. */
export function useAssignDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignDepartmentDto }) => assignDepartment(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/** `users:user:set-authority-limit`-gated (FR-USER-005.1) — invalidates list + detail, per the plan's explicit instruction. */
export function useSetAuthorityLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: SetAuthorityLimitDto }) => setAuthorityLimit(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/** `users:role:view`-gated; the roles currently assigned to one user (`GET /users/:id/roles`), backing `UserRolesSection`. */
export function useUserRoles(userId: string | undefined) {
  return useQuery({ queryKey: rolesKey(userId), queryFn: () => listUserRoles(userId as string), enabled: !!userId });
}

/** `users:role:assign`-gated (SoD-checked, FR-USER-009.1) — a rejection's real server message is surfaced verbatim by callers, same discipline `useGrantPermission`/`useRevokePermission` (`features/roles/hooks/use-role-permissions.ts`) already established. */
export function useAssignRoleToUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => assignRoleToUser(userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey(userId) }),
  });
}

export function useUnassignRoleFromUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => unassignRoleFromUser(userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey(userId) }),
  });
}
