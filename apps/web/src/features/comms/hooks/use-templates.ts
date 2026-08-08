"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTemplateDto, TemplateResponseDto, UpdateTemplateDto } from "@klickit/contracts";
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from "../api/templates.api";

/** `["comms", "templates"]` query-key convention mirrors `features/roles/hooks/use-roles.ts`'s own `ROLES_QUERY_KEY`, namespaced under `comms` so later parts' own Broadcasts/Messages/Optouts/TriggerBindings hooks don't collide with this one. */
export const TEMPLATES_QUERY_KEY = ["comms", "templates"] as const;

function detailKey(id: string | undefined) {
  return [...TEMPLATES_QUERY_KEY, "detail", id] as const;
}

/** `comms:template:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useTemplates() {
  return useQuery({ queryKey: TEMPLATES_QUERY_KEY, queryFn: listTemplates });
}

export function useTemplate(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTemplate(id as string), enabled: !!id });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTemplateDto) => createTemplate(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}

/** Diff-based submit at each call site (mirrors `useUpdateRole`/`useUpdateDepartment`) — invalidates both the list and this template's own detail cache. */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTemplateDto }) => updateTemplate(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/** Real delete — invalidates the whole list (mirrors `useDeleteClass`/`useDeleteFeeStructure`). A blocked/failed delete leaves the cache untouched. */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}

export type { TemplateResponseDto };
