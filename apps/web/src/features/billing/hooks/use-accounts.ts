"use client";

import { useQuery } from "@tanstack/react-query";
import { listIncomeAccounts } from "../api/accounts.api";

/** `accounting:account:view`-gated server-side — a role that can manage fee categories but not chart-of-accounts will 403 here; `<GlAccountSelect>` falls back to a plain UUID text input in that case rather than blocking the whole fee-category form (see that component's own doc comment). */
export function useIncomeAccounts() {
  return useQuery({
    queryKey: ["billing", "accounts", "income"],
    queryFn: listIncomeAccounts,
  });
}
