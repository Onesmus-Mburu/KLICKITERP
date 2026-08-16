"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFaTransferDto, FaTransferResponseDto } from "@klickit/contracts";
import { acknowledgeTransfer, createTransfer, listTransfersByAsset } from "../api/transfers.api";
import { FIXED_ASSETS_ASSETS_QUERY_KEY } from "./use-assets";

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — `["fixed-assets",
 * "transfers", assetId]` query-key root, genuinely scoped by `assetId` (not
 * a bare `["fixed-assets","transfers"]` global root) — matches the real API
 * shape: `TransfersController` has no global "list every transfer across
 * every asset" endpoint, every route requires an `assetId`, the same
 * `use-employee-assignments.ts` (Payroll Slice 22 Part 3) precedent this
 * part's own task brief points at directly.
 */
export function fixedAssetsTransfersQueryKey(assetId: string | undefined) {
  return ["fixed-assets", "transfers", assetId] as const;
}

export function useTransfersByAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: fixedAssetsTransfersQueryKey(assetId),
    queryFn: () => listTransfersByAsset(assetId as string),
    enabled: !!assetId,
  });
}

/**
 * `create()` overwrites the asset's OWN live `location`/`custodianUserId` in
 * the same call (see `transfers.api.ts`'s own doc comment) — invalidates
 * both this asset's transfer history AND its detail query
 * (`FIXED_ASSETS_ASSETS_QUERY_KEY`, `use-assets.ts`'s own shared root) so the
 * parent asset detail page's own location/custodian fields refresh alongside
 * the new history row, not just the panel itself.
 */
export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaTransferDto) => createTransfer(dto),
    onSuccess: (created: FaTransferResponseDto) => {
      queryClient.invalidateQueries({ queryKey: fixedAssetsTransfersQueryKey(created.assetId) });
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

/** No body — see `transfers.api.ts`'s own doc comment for the real `422` idempotency guard on an already-acknowledged transfer. Only invalidates this asset's transfer history (`ackBy` never affects the asset's own live fields). */
export function useAcknowledgeTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeTransfer(id),
    onSuccess: (updated: FaTransferResponseDto) => {
      queryClient.invalidateQueries({ queryKey: fixedAssetsTransfersQueryKey(updated.assetId) });
    },
  });
}

export type { FaTransferResponseDto };
