"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOptoutDto } from "@klickit/contracts";
import { createOptout, deleteOptout, listOptoutsByGuardian } from "../api/optouts.api";

/** `["comms", "optouts"]` — sibling to `templates.ts`'s/`broadcasts.ts`'s own `["comms", ...]` query keys. */
export const OPTOUTS_QUERY_KEY = ["comms", "optouts"] as const;

function guardianKey(guardianId: string | undefined) {
  return [...OPTOUTS_QUERY_KEY, "guardian", guardianId] as const;
}

/**
 * `guardianId` is REQUIRED by the backend (`GET /comms/optouts` has no
 * "list all" mode — see `optouts.api.ts`'s own doc comment) — `enabled`
 * therefore gates on a non-empty string, not just `!!guardianId`, so the
 * page's own "nothing searched yet" state (an empty draft input) never
 * fires a real request.
 */
export function useOptoutsByGuardian(guardianId: string | undefined) {
  return useQuery({
    queryKey: guardianKey(guardianId),
    queryFn: () => listOptoutsByGuardian(guardianId as string),
    enabled: !!guardianId,
  });
}

/** Invalidates only the affected guardian's own list — this table's other guardians' cached entries stay untouched, same targeted-invalidation reasoning `useUpdateTemplate()` establishes for its own detail key. */
export function useCreateOptout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOptoutDto) => createOptout(dto),
    onSuccess: (created) => queryClient.invalidateQueries({ queryKey: guardianKey(created.guardianId) }),
  });
}

/** Real delete — `guardianId` is passed alongside `id` since `DELETE /comms/optouts/:id` returns only `{ deleted: true }` (no row to read the guardian back off of), mirroring `useDeleteTemplate()`'s own real-delete-invalidates-the-list shape. */
export function useDeleteOptout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; guardianId: string }) => deleteOptout(id),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: guardianKey(variables.guardianId) }),
  });
}
