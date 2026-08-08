"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users-lookup.api";

/**
 * Backs the `EXPLICIT_USER_IDS` audience `<MultiSelect>` in
 * `audience-picker.tsx`. Own query key namespaced under `["comms", ...]`
 * (not `["users", ...]` or `["departments", ...]`) since this is Comms' own
 * narrow lookup, not a shared Users cache — mirrors
 * `features/departments/hooks/use-users-lookup.ts`'s own reasoning.
 */
export function useUsersLookup() {
  return useQuery({ queryKey: ["comms", "users-lookup"] as const, queryFn: listUsersForLookup });
}
