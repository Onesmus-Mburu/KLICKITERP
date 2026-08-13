"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IntegrityRunResponseDto } from "@klickit/contracts";
import { listIntegrityRuns, runIntegritySweep } from "../api/integrity-sweep.api";

export const INTEGRITY_SWEEP_QUERY_KEY = ["accounting", "integrity-sweep"] as const;

function listKey(limit: number | undefined) {
  return [...INTEGRITY_SWEEP_QUERY_KEY, "runs", limit] as const;
}

/** `accounting:integrity-sweep:run`-gated (the only permission this controller has, for both routes — see `integrity-sweep.api.ts`'s own doc comment). Newest-first; server defaults to 50 recent runs when `limit` is omitted. */
export function useIntegrityRuns(limit?: number) {
  return useQuery({ queryKey: listKey(limit), queryFn: () => listIntegrityRuns(limit) });
}

/**
 * `POST .../run` — no body, no scheduler exists anywhere in this codebase
 * for this sweep (every run is a deliberate on-demand click). Always safe to
 * retry: read-only against `gl_journal_line`/`gl_period_account_total`,
 * writes exactly one new `gl_integrity_run` row. Invalidates the runs list
 * so the fresh run appears in the history table immediately — the
 * mutation's own response IS that fresh run, but re-fetching keeps this
 * feature folder's single source of truth the query cache, matching every
 * other mutation in `features/accounting`.
 */
export function useRunIntegritySweep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runIntegritySweep(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INTEGRITY_SWEEP_QUERY_KEY }),
  });
}

export type { IntegrityRunResponseDto };
