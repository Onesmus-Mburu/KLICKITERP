"use client";

import { useQuery } from "@tanstack/react-query";
import { listPermissions } from "../api/permissions.api";

export const PERMISSIONS_QUERY_KEY = ["permissions"] as const;

function listKey(module: string | undefined) {
  return [...PERMISSIONS_QUERY_KEY, "list", module ?? "ALL"] as const;
}

/** `users:role:view`-gated; `module: undefined` lists the full 259-code catalogue across all 24 modules (the controller's own `@Query("module") module?:` is genuinely optional). */
export function usePermissions(module: string | undefined) {
  return useQuery({ queryKey: listKey(module), queryFn: () => listPermissions(module) });
}
