"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from "@klickit/contracts";
import { createCategory, getCategory, listCategories, updateCategory } from "../api/categories.api";

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — `["expenses",
 * "categories"]` query-key convention mirrors `features/inventory/hooks/use-categories.ts`'s
 * own shape, namespaced under `"expenses"` since this feature folder will
 * grow further Module 14 sub-domains (petty cash, claims, recurring
 * templates, …) in future parts, the same "one shared feature root,
 * namespaced query keys per sub-domain" pattern `features/accounting/`/
 * `features/procurement/`/`features/inventory/` already established.
 */
export const EXPENSE_CATEGORIES_QUERY_KEY = ["expenses", "categories"] as const;

function listKey(parentId?: string) {
  return [...EXPENSE_CATEGORIES_QUERY_KEY, "list", parentId] as const;
}

function detailKey(id: string | undefined) {
  return [...EXPENSE_CATEGORIES_QUERY_KEY, "detail", id] as const;
}

/** `expenses:category:manage`-gated. Omit `parentId` for every category (any depth) — the picker/list shape this part's screens both use; pass the literal string `"null"` for root-level only, see `categories.api.ts`'s own doc comment. */
export function useCategories(parentId?: string) {
  return useQuery({ queryKey: listKey(parentId), queryFn: () => listCategories(parentId) });
}

export function useCategory(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCategory(id as string), enabled: !!id });
}

/** Every list query (parentId-keyed) is invalidated broadly, not per-parentId — a create/rename/re-parent can affect any of the 3 distinct `parentId` states this feature queries. */
function invalidateCategoryQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: EXPENSE_CATEGORIES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCategoryDto) => createCategory(dto),
    onSuccess: () => invalidateCategoryQueries(queryClient),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCategoryDto }) => updateCategory(id, dto),
    onSuccess: (updated) => invalidateCategoryQueries(queryClient, updated.id),
  });
}

export type { CategoryResponseDto };
