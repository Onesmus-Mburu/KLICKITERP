"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCustomFieldDto, UpdateCustomFieldDto } from "@klickit/contracts";
import { createCustomField, getCustomField, listCustomFields, updateCustomField } from "../api/custom-fields.api";
import type { CustomFieldEntityType } from "../types";

export const CUSTOM_FIELDS_QUERY_KEY = ["settings", "custom-fields"] as const;

function listKey(entity: CustomFieldEntityType | undefined) {
  return [...CUSTOM_FIELDS_QUERY_KEY, "list", entity ?? "ALL"] as const;
}
function detailKey(id: string | undefined) {
  return [...CUSTOM_FIELDS_QUERY_KEY, "detail", id] as const;
}

/** `entity: undefined` lists across all 4 entity types (the controller's own `@Query("entity") entity?:` is genuinely optional) — `settings:custom-field:view`-gated server-side. */
export function useCustomFields(entity: CustomFieldEntityType | undefined) {
  return useQuery({ queryKey: listKey(entity), queryFn: () => listCustomFields(entity) });
}

export function useCustomField(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCustomField(id as string), enabled: !!id });
}

/** Invalidates every list variant (all 4 entity-filtered caches plus the unfiltered "ALL" one) — this hook doesn't know which filter tab the caller currently has open. */
export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCustomFieldDto) => createCustomField(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOM_FIELDS_QUERY_KEY }),
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCustomFieldDto }) => updateCustomField(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: CUSTOM_FIELDS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}
