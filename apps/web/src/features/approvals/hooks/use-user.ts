"use client";

import { useQuery } from "@tanstack/react-query";
import { getUser } from "../api/users.api";

/**
 * `users:user:view`-gated server-side — a plain approver role may not hold
 * it (per the plan's own note), so a real 403 here is an EXPECTED path, not
 * a rare edge case. `lib/query-client.ts`'s shared `QueryClient` already
 * never retries a 403/401, and `<UserName>`/callers degrade to the raw id on
 * `isError` (the same conditional-degrade-to-raw-id template
 * `GlAccountSelect`/`BankAccountSelect` established), so no extra
 * `retry:false` override is needed here.
 */
export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ["approvals", "user", id],
    queryFn: () => getUser(id as string),
    enabled: !!id,
  });
}
