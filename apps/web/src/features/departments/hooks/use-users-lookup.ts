"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users-lookup.api";

/**
 * Backs the head-of-department `<Combobox>` in both create/edit dialogs.
 * Own query key namespaced under `["departments", ...]` (not `["users", ...]`)
 * since this is Departments' own narrow lookup, not a shared Users cache —
 * `features/users/` (Part 4) will own its own real list query independently.
 */
export function useUsersLookup() {
  return useQuery({ queryKey: ["departments", "users-lookup"] as const, queryFn: listUsersForLookup });
}
