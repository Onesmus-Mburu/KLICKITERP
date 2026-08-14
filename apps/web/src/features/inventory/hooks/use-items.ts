"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateItemDto, ItemResponseDto, UpdateItemDto } from "@klickit/contracts";
import { createItem, findItemByBarcode, getItem, listItems, searchItems, updateItem, type InvItemType, type ListItemsParams } from "../api/items.api";

/** `["inventory", "items"]` — same namespaced-per-sub-domain shape `use-categories.ts`/`use-stores.ts` establish. */
export const ITEMS_QUERY_KEY = ["inventory", "items"] as const;

function listKey(params: ListItemsParams) {
  return [...ITEMS_QUERY_KEY, "list", params] as const;
}

function searchKey(q: string, limit: number | undefined) {
  return [...ITEMS_QUERY_KEY, "search", q, limit] as const;
}

function barcodeKey(barcode: string | undefined) {
  return [...ITEMS_QUERY_KEY, "barcode", barcode] as const;
}

function detailKey(id: string | undefined) {
  return [...ITEMS_QUERY_KEY, "detail", id] as const;
}

/** `inventory:item:view`-gated. */
export function useItems(params: ListItemsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listItems(params) });
}

/**
 * Trigram search (`GET .../search`) — the `<ItemCombobox>`'s primary data
 * source, a genuinely separate endpoint from `useItems()`, not a
 * client-side filter over it. `q` is NOT trimmed/validated here (the
 * caller, `<ItemCombobox>`, already only enables this once `q` is
 * non-empty post-debounce), mirroring `useSupplierSearch()`'s own shape.
 */
export function useItemSearch(q: string, limit?: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: searchKey(q, limit),
    queryFn: () => searchItems(q, limit),
    enabled: (options.enabled ?? true) && q.length > 0,
  });
}

/** Real `null` (not an error) for "no item has this barcode" — `<QueryBoundary>` treats a `null` `data` as `empty`, which IS the correct rendering for this genuine no-match case. */
export function useItemByBarcode(barcode: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: barcodeKey(barcode),
    queryFn: () => findItemByBarcode(barcode as string),
    enabled: (options.enabled ?? true) && !!barcode,
  });
}

export function useItem(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getItem(id as string), enabled: !!id });
}

function invalidateItemQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

/** `inventory:item:manage`-gated. BR-INV-04 enforced server-side. */
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemDto) => createItem(dto),
    onSuccess: () => invalidateItemQueries(queryClient),
  });
}

/** `inventory:item:manage`-gated. BR-INV-04 re-checked server-side. */
export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateItemDto }) => updateItem(id, dto),
    onSuccess: (updated) => invalidateItemQueries(queryClient, updated.id),
  });
}

export type { InvItemType, ItemResponseDto, ListItemsParams };
