"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTriggerBindingDto, UpdateTriggerBindingDto } from "@klickit/contracts";
import { createTriggerBinding, getTriggerBinding, listTriggerBindings, updateTriggerBinding } from "../api/trigger-bindings.api";

/** `["comms", "trigger-bindings"]` — sibling to `templates.ts`'s/`broadcasts.ts`'s/`messages.ts`'s/`optouts.ts`'s own `["comms", ...]` query keys. */
export const TRIGGER_BINDINGS_QUERY_KEY = ["comms", "trigger-bindings"] as const;

function detailKey(id: string | undefined) {
  return [...TRIGGER_BINDINGS_QUERY_KEY, "detail", id] as const;
}

/** `comms:trigger-binding:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useTriggerBindings() {
  return useQuery({ queryKey: TRIGGER_BINDINGS_QUERY_KEY, queryFn: listTriggerBindings });
}

export function useTriggerBinding(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTriggerBinding(id as string), enabled: !!id });
}

export function useCreateTriggerBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTriggerBindingDto) => createTriggerBinding(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TRIGGER_BINDINGS_QUERY_KEY }),
  });
}

/** Diff-based submit at each call site (mirrors `useUpdateTemplate()`) — invalidates both the list and this binding's own detail cache. No `useDeleteTriggerBinding` — no delete route exists (`trigger-bindings.api.ts`'s own doc comment). */
export function useUpdateTriggerBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTriggerBindingDto }) => updateTriggerBinding(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: TRIGGER_BINDINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}
