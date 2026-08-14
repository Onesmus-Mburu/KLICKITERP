"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { domains_inventory_category_schema } from "@klickit/contracts";
import { createCategory, getCategory, listCategories, updateCategory } from "../api/categories.api";

type CreateCategoryDto = domains_inventory_category_schema.CreateCategoryDto;
type UpdateCategoryDto = domains_inventory_category_schema.UpdateCategoryDto;
type CategoryResponseDto = domains_inventory_category_schema.CategoryResponseDto;

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — `["inventory",
 * "categories"]` query-key convention mirrors `features/accounting/hooks/use-accounts.ts`'s
 * own namespaced-per-sub-domain shape, since `features/inventory/` will grow
 * further Module 13 sub-domains (stock movements, transfers, stock takes, …)
 * in future parts.
 */
export const CATEGORIES_QUERY_KEY = ["inventory", "categories"] as const;

function listKey(parentId: string | undefined) {
  return [...CATEGORIES_QUERY_KEY, "list", parentId] as const;
}

function detailKey(id: string | undefined) {
  return [...CATEGORIES_QUERY_KEY, "detail", id] as const;
}

/** `inventory:category:manage`-gated (the only permission this whole controller has — see `categories.api.ts`'s own doc comment). Omit `parentId` for all categories; pass `""` for root-level only. */
export function useCategories(parentId?: string) {
  return useQuery({ queryKey: listKey(parentId), queryFn: () => listCategories(parentId) });
}

export function useCategory(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCategory(id as string), enabled: !!id });
}

function invalidateCategoryQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
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
