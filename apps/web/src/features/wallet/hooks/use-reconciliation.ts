"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWalletReconciliationStatus, runWalletReconciliation } from "../api/reconciliation.api";

export const RECONCILIATION_QUERY_KEY = ["wallet", "reconciliation", "status"] as const;

/** `GET wallet-reconciliation/status` — the latest sweep result, `null` if none has ever run. */
export function useWalletReconciliationStatus() {
  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEY,
    queryFn: () => getWalletReconciliationStatus(),
  });
}

/** `POST wallet-reconciliation/run` — on-demand only, no scheduler exists. Invalidates the status query so the fresh result renders immediately (the mutation's own response IS that fresh result, but re-fetching keeps this page's single source of truth the query cache, matching every other mutation in this feature). */
export function useRunWalletReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runWalletReconciliation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECONCILIATION_QUERY_KEY }),
  });
}
