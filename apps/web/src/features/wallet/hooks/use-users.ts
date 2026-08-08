"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsers } from "../api/users.api";

/** Backs the Service Points "assign operator" combobox — see `users.api.ts`'s own doc comment on the `pageSize=100`-and-filter-client-side tradeoff. */
export function useUsersForOperatorPicker() {
  return useQuery({
    queryKey: ["wallet", "users", "operator-picker"],
    queryFn: () => listUsers({ page: 1, pageSize: 100 }),
  });
}
