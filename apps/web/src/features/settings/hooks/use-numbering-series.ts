"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { getNumberingSeries, listNumberingSeries, previewNumberingSeries } from "../api/numbering-series.api";

export const NUMBERING_SERIES_QUERY_KEY = ["settings", "numbering-series"] as const;

/** `settings:numbering-series:view`-gated server-side. Small, unbounded list (per the real backend shape — no pagination on this controller) — no `serverPagination`, same as every other Settings list this dispatch builds. */
export function useNumberingSeriesList() {
  return useQuery({ queryKey: [...NUMBERING_SERIES_QUERY_KEY, "list"], queryFn: listNumberingSeries });
}

export function useNumberingSeries(id: string | undefined) {
  return useQuery({
    queryKey: [...NUMBERING_SERIES_QUERY_KEY, "detail", id],
    queryFn: () => getNumberingSeries(id as string),
    enabled: !!id,
  });
}

/**
 * A `useMutation`, not a `useQuery` — "Preview next N" is an explicit,
 * on-demand admin action (the user picks a `count` and clicks "Run
 * preview"), not something to auto-fetch on render, same shape
 * `useTestIntegrationConfigConnection()`
 * (`features/settings/hooks/use-integration-configs.ts`) already
 * establishes for an analogous on-demand GET-shaped action. Read-only
 * server-side (`NumberingController.preview()` never advances `next_no` —
 * see that handler's own doc comment) so there is nothing to invalidate on
 * success.
 */
export function usePreviewNumberingSeries() {
  return useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => previewNumberingSeries(id, count),
  });
}
