"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users-lookup.api";

/** Backs the optional `custodianUserId` `<Combobox>` in `create-asset-dialog.tsx`/`edit-asset-dialog.tsx`. Own query key namespaced under `["fixed-assets", ...]`, mirroring `features/payroll/hooks/use-users-lookup.ts`'s own precedent. */
export function useUsersLookup() {
  return useQuery({ queryKey: ["fixed-assets", "users-lookup"] as const, queryFn: listUsersForLookup });
}
