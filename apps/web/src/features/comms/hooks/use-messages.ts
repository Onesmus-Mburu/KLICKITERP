"use client";

import { useQuery } from "@tanstack/react-query";
import { listMessages, type ListMessagesParams } from "../api/messages.api";

/** `["comms", "messages"]` — sibling to `templates.ts`'s own `["comms", "templates"]`/`broadcasts.ts`'s `["comms", "broadcasts"]` query keys, namespaced under `comms` so this part's hooks don't collide with the others'. */
export const MESSAGES_QUERY_KEY = ["comms", "messages"] as const;

/**
 * `params` is the whole query key (mirrors `useAllReceipts()`/
 * `listWebhookDeliveries`'s own callers) — a page/pageSize/filter change is
 * a genuinely different query, correctly cache-keyed rather than silently
 * reusing a stale entry. `comms:message:view`-gated server-side; a 403
 * surfaces to `<QueryBoundary>` untouched, same as every other hook in this
 * codebase.
 */
export function useMessages(params: ListMessagesParams) {
  return useQuery({
    queryKey: [...MESSAGES_QUERY_KEY, params],
    queryFn: () => listMessages(params),
  });
}
