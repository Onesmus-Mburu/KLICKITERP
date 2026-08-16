"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFaCategoryDto, FaCategoryResponseDto, UpdateFaCategoryDto } from "@klickit/contracts";
import { createCategory, getCategory, listCategories, updateCategory } from "../api/categories.api";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — `["fixed-assets",
 * "categories"]` query-key root, namespaced under `"fixed-assets"` since this
 * feature folder will grow further Module 17 sub-domains (transfers,
 * maintenance, depreciation runs, disposals, verification, …) in future
 * parts — the same "one shared feature root, namespaced query keys per
 * sub-domain" shape `features/payroll/`/`features/banking/` already
 * established.
 */
export const FIXED_ASSETS_CATEGORIES_QUERY_KEY = ["fixed-assets", "categories"] as const;

function listKey() {
  return [...FIXED_ASSETS_CATEGORIES_QUERY_KEY, "list"] as const;
}

function detailKey(id: string | undefined) {
  return [...FIXED_ASSETS_CATEGORIES_QUERY_KEY, "detail", id] as const;
}

/** `fixed-assets:category:manage`-gated — the ONE shared permission every route on `CategoriesController` uses, including this list (see `categories.api.ts`'s own doc comment). A role without it hits `<QueryBoundary>`'s own permission-denied state here too. */
export function useCategories() {
  return useQuery({ queryKey: listKey(), queryFn: () => listCategories() });
}

export function useCategory(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCategory(id as string), enabled: !!id });
}

function invalidateCategoryQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_CATEGORIES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaCategoryDto) => createCategory(dto),
    onSuccess: () => invalidateCategoryQueries(queryClient),
  });
}

/** Genuinely full editability, including `name`/`method` — see `categories.api.ts`'s own doc comment. */
export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFaCategoryDto }) => updateCategory(id, dto),
    onSuccess: (updated) => invalidateCategoryQueries(queryClient, updated.id),
  });
}

export type { FaCategoryResponseDto };
