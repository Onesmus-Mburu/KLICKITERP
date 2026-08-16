"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompleteFaMaintenanceDto, FaMaintenanceResponseDto, ScheduleFaMaintenanceDto } from "@klickit/contracts";
import { completeMaintenance, listMaintenanceByAsset, scheduleMaintenance } from "../api/maintenance.api";
import { FIXED_ASSETS_ASSETS_QUERY_KEY } from "./use-assets";

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — `["fixed-assets",
 * "maintenance", assetId]` query-key root, genuinely scoped by `assetId` —
 * `MaintenanceController` has no global "list every maintenance event across
 * every asset" endpoint, every route requires an `assetId`, the same
 * `use-transfers.ts`/`use-employee-assignments.ts` shape.
 */
export function fixedAssetsMaintenanceQueryKey(assetId: string | undefined) {
  return ["fixed-assets", "maintenance", assetId] as const;
}

export function useMaintenanceByAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: fixedAssetsMaintenanceQueryKey(assetId),
    queryFn: () => listMaintenanceByAsset(assetId as string),
    enabled: !!assetId,
  });
}

/** `schedule()` immediately flips the asset's own `status` to `UNDER_MAINTENANCE` — invalidates both this asset's maintenance history AND its detail query so the parent page's status badge refreshes alongside the new history row. */
export function useScheduleMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ScheduleFaMaintenanceDto) => scheduleMaintenance(dto),
    onSuccess: (created: FaMaintenanceResponseDto) => {
      queryClient.invalidateQueries({ queryKey: fixedAssetsMaintenanceQueryKey(created.assetId) });
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

/** `complete()` unconditionally force-sets the asset's own `status` back to `ACTIVE` — see `maintenance.api.ts`'s own doc comment. Same dual-invalidation as `useScheduleMaintenance()` above. */
export function useCompleteMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CompleteFaMaintenanceDto }) => completeMaintenance(id, dto),
    onSuccess: (updated: FaMaintenanceResponseDto) => {
      queryClient.invalidateQueries({ queryKey: fixedAssetsMaintenanceQueryKey(updated.assetId) });
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

export type { FaMaintenanceResponseDto };
