"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFaAssetDto, FaAssetResponseDto, UpdateFaAssetConditionDto } from "@klickit/contracts";
import {
  createAsset,
  findAssetByBarcode,
  getAsset,
  listAssets,
  searchAssets,
  updateAsset,
  updateAssetCondition,
  type ListFaAssetsParams,
  type UpdateAssetInput,
} from "../api/assets.api";

/** `["fixed-assets", "assets"]` query-key root — see `use-categories.ts`'s own doc comment for the shared-root convention this mirrors. */
export const FIXED_ASSETS_ASSETS_QUERY_KEY = ["fixed-assets", "assets"] as const;

function listKey(params: ListFaAssetsParams) {
  return [...FIXED_ASSETS_ASSETS_QUERY_KEY, "list", params] as const;
}

function searchKey(q: string) {
  return [...FIXED_ASSETS_ASSETS_QUERY_KEY, "search", q] as const;
}

function barcodeKey(barcode: string) {
  return [...FIXED_ASSETS_ASSETS_QUERY_KEY, "barcode", barcode] as const;
}

function detailKey(id: string | undefined) {
  return [...FIXED_ASSETS_ASSETS_QUERY_KEY, "detail", id] as const;
}

/** `fixed-assets:asset:view`-gated. */
export function useAssets(params: ListFaAssetsParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listAssets(params), enabled: options.enabled ?? true });
}

/** `code`/`barcode` substring search (`GET .../search`) — a genuinely separate endpoint, not a client-side filter. Only enabled once `q` is non-empty. */
export function useAssetSearch(q: string, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: searchKey(q), queryFn: () => searchAssets(q), enabled: (options.enabled ?? true) && q.length > 0 });
}

/** Exact-match barcode lookup — a real 404 (not an empty list) when nothing matches, see `assets.api.ts`'s own doc comment. `<QueryBoundary>`'s "error" state (not "empty") is the real signal here; the barcode-lookup panel reads `query.error instanceof ApiError && status === 404` itself rather than relying on `<QueryBoundary>` for this one narrow case — see `assets/page.tsx`. */
export function useAssetByBarcode(barcode: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: barcodeKey(barcode),
    queryFn: () => findAssetByBarcode(barcode),
    enabled: (options.enabled ?? true) && barcode.length > 0,
    retry: false,
  });
}

export function useAsset(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getAsset(id as string), enabled: !!id });
}

function invalidateAssetQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaAssetDto) => createAsset(dto),
    onSuccess: () => invalidateAssetQueries(queryClient),
  });
}

/** The 8 create-only/immutable fields are never part of `dto` here — see `assets.api.ts`'s own doc comment. */
export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAssetInput }) => updateAsset(id, dto),
    onSuccess: (updated) => invalidateAssetQueries(queryClient, updated.id),
  });
}

/** A dedicated single-field mutation, separate from `useUpdateAsset()` above. */
export function useUpdateAssetCondition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFaAssetConditionDto }) => updateAssetCondition(id, dto),
    onSuccess: (updated) => invalidateAssetQueries(queryClient, updated.id),
  });
}

export type { FaAssetResponseDto };
