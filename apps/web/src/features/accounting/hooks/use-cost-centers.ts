"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CostCenterResponseDto, CreateCostCenterDto, UpdateCostCenterDto } from "@klickit/contracts";
import {
  activateCostCenter,
  createCostCenter,
  deactivateCostCenter,
  getCostCenter,
  listCostCenters,
  updateCostCenter,
} from "../api/cost-centers.api";

export const COST_CENTERS_QUERY_KEY = ["accounting", "cost-centers"] as const;

function detailKey(id: string | undefined) {
  return [...COST_CENTERS_QUERY_KEY, "detail", id] as const;
}

/** `accounting:cost-center:view`-gated. `activeOnly` omitted by every current caller (the list page shows both active and inactive rows, distinguished by a status badge, same shape `wallet/components/service-points-table.tsx` and `billing`'s fee-categories page both already establish) — left as a real, optional parameter rather than hardcoded, matching `listCostCenters()`'s own signature. */
export function useCostCenters(activeOnly?: boolean) {
  return useQuery({ queryKey: [...COST_CENTERS_QUERY_KEY, activeOnly], queryFn: () => listCostCenters(activeOnly) });
}

export function useCostCenter(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCostCenter(id as string), enabled: !!id });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCostCenterDto) => createCostCenter(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COST_CENTERS_QUERY_KEY }),
  });
}

export function useUpdateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCostCenterDto }) => updateCostCenter(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: COST_CENTERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export function useDeactivateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateCostCenter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COST_CENTERS_QUERY_KEY }),
  });
}

export function useActivateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateCostCenter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COST_CENTERS_QUERY_KEY }),
  });
}

export type { CostCenterResponseDto };
