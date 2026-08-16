"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users-lookup.api";

/** Backs the optional "linked login account" `<Combobox>` in `create-employee-dialog.tsx`/`edit-employee-dialog.tsx`. Own query key namespaced under `["payroll", ...]`, mirroring `features/departments/hooks/use-users-lookup.ts`'s own precedent. */
export function useUsersLookup() {
  return useQuery({ queryKey: ["payroll", "users-lookup"] as const, queryFn: listUsersForLookup });
}
