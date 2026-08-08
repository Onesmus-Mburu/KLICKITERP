"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFeeCategoryDto, UpdateFeeCategoryDto } from "@klickit/contracts";
import {
  activateFeeCategory,
  createFeeCategory,
  deactivateFeeCategory,
  listFeeCategories,
  updateFeeCategory,
} from "../api/fee-categories.api";

export const FEE_CATEGORIES_QUERY_KEY = ["billing", "fee-categories"] as const;

export function useFeeCategories() {
  return useQuery({
    queryKey: FEE_CATEGORIES_QUERY_KEY,
    queryFn: listFeeCategories,
  });
}

export function useCreateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFeeCategoryDto) => createFeeCategory(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY }),
  });
}

export function useUpdateFeeCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateFeeCategoryDto) => updateFeeCategory(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY }),
  });
}

/** No delete endpoint exists on this controller (confirmed by reading it) — activate/deactivate toggle only, same shape as the Classes & Streams precedent. */
export function useDeactivateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateFeeCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY }),
  });
}

export function useActivateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateFeeCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY }),
  });
}
