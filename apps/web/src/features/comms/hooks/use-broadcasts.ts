"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBroadcastDto, SubmitBroadcastApprovalDto } from "@klickit/contracts";
import {
  approveBroadcast,
  cancelBroadcast,
  createBroadcast,
  getBroadcast,
  listBroadcasts,
  sendBroadcast,
  submitForApproval,
} from "../api/broadcasts.api";

/** `["comms", "broadcasts"]` — sibling to `templates.ts`'s own `["comms", "templates"]` query key, namespaced under `comms` so this part's hooks don't collide with Part 1's (or later parts' Messages/Optouts/TriggerBindings) own keys. */
export const BROADCASTS_QUERY_KEY = ["comms", "broadcasts"] as const;

function detailKey(id: string | undefined) {
  return [...BROADCASTS_QUERY_KEY, "detail", id] as const;
}

/** `comms:broadcast:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useBroadcasts() {
  return useQuery({ queryKey: BROADCASTS_QUERY_KEY, queryFn: listBroadcasts });
}

export function useBroadcast(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getBroadcast(id as string), enabled: !!id });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBroadcastDto) => createBroadcast(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY }),
  });
}

/**
 * Every status-transition mutation below (`submit-for-approval`/`approve`/
 * `cancel`/`send`) invalidates the WHOLE `["comms","broadcasts"]` prefix
 * (list + this broadcast's own detail) rather than hand-picking keys — same
 * broad-invalidation reasoning `useDecideInstance`
 * (`features/approvals/hooks/use-instances.ts`) already establishes for its
 * own status-transition mutation.
 */
export function useSubmitForApproval(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitBroadcastApprovalDto) => submitForApproval(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY }),
  });
}

export function useApproveBroadcast(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => approveBroadcast(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY }),
  });
}

export function useCancelBroadcast(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelBroadcast(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY }),
  });
}

export function useSendBroadcast(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sendBroadcast(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY }),
  });
}
