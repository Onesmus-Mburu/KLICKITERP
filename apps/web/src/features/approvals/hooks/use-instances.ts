"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DecideInstanceDto } from "@klickit/contracts";
import { decideInstance, getInbox, getInstance, listInstances } from "../api/instances.api";

export const APPROVALS_QUERY_KEY = ["approvals", "instances"] as const;

function inboxKey() {
  return [...APPROVALS_QUERY_KEY, "inbox"] as const;
}
function detailKey(id: string | undefined) {
  return [...APPROVALS_QUERY_KEY, "detail", id] as const;
}
/**
 * Exported (not just a local closure) — `features/payments/hooks/use-receipts.ts`'s
 * `useReceiptReversalInstance()` duplicates this exact key SHAPE for its own
 * cross-feature cache invalidation after a reversal request/execute (the
 * same "duplicate the literal key, don't import the hook" convention
 * `use-receipts.ts` already established for `["students","ledger",studentId]`/
 * `["billing","invoices","student",studentId]`) — kept here as the one
 * source of truth for what that shape actually is.
 */
export function domainKey(domainCode: string | undefined) {
  return [...APPROVALS_QUERY_KEY, "domain", domainCode] as const;
}

/** `GET /approvals/instances/inbox` — the approval inbox screen's primary query. `refetchOnWindowFocus` (TanStack Query's default, left unchanged) plus the inbox page's own manual refresh button are the only "freshness" mechanisms — no notifications/polling/websocket exists anywhere in this codebase (per the plan's explicit instruction not to build one). */
export function useInbox() {
  return useQuery({ queryKey: inboxKey(), queryFn: getInbox });
}

/** `GET /approvals/instances/{id}` — the decide screen's full detail + action trail. */
export function useInstance(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getInstance(id as string), enabled: !!id });
}

/**
 * `GET /approvals/instances?domainCode=` — the entity-status-resolution use
 * case (per the plan): no endpoint filters by `entityId`, so a caller that
 * wants "the reversal status of THIS receipt" fetches every instance for a
 * domain code and picks the matching row(s) itself (see
 * `features/payments/lib/reversal.ts`'s `pickLatestInstanceForEntity()`).
 * Acceptable given this codebase's confirmed low real-world volume for any
 * single domain code (18 domain codes total, `PAYMENT_REVERSALS` being one
 * of them, per the `0900` seed migration).
 */
export function useInstancesForDomain(domainCode: string | undefined) {
  return useQuery({
    queryKey: domainKey(domainCode),
    queryFn: () => listInstances({ domainCode }),
    enabled: !!domainCode,
  });
}

/**
 * `POST /approvals/instances/{id}/decide` — invalidates the WHOLE
 * `["approvals","instances"]` prefix (inbox + this instance's own detail +
 * every domain-filtered list any screen has cached, e.g. Payments' own
 * reversal-status query) rather than threading `domainCode` through this
 * hook's signature — TanStack Query's `invalidateQueries` matches by key
 * PREFIX, so this one call covers every descendant key without this generic
 * engine hook needing to know which specific domain codes exist.
 */
export function useDecideInstance(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: DecideInstanceDto) => decideInstance(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
    },
  });
}
