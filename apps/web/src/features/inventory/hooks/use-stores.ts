"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateStoreDto, StoreResponseDto, UpdateStoreDto } from "@klickit/contracts";
import { createStore, getStore, listStores, updateStore } from "../api/stores.api";

/** `["inventory", "stores"]` — same namespaced-per-sub-domain shape `use-categories.ts` establishes. */
export const STORES_QUERY_KEY = ["inventory", "stores"] as const;

function listKey(isActive: boolean | undefined) {
  return [...STORES_QUERY_KEY, "list", isActive] as const;
}

function detailKey(id: string | undefined) {
  return [...STORES_QUERY_KEY, "detail", id] as const;
}

/** `inventory:store:manage`-gated (the only permission this whole controller has). */
export function useStores(isActive?: boolean) {
  return useQuery({ queryKey: listKey(isActive), queryFn: () => listStores(isActive) });
}

export function useStore(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getStore(id as string), enabled: !!id });
}

function invalidateStoreQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: STORES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStoreDto) => createStore(dto),
    onSuccess: () => invalidateStoreQueries(queryClient),
  });
}

/** Also the sole decommission path (`{isActive: false}`) — no dedicated deactivate route exists, see `stores.api.ts`'s own doc comment. */
export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateStoreDto }) => updateStore(id, dto),
    onSuccess: (updated) => invalidateStoreQueries(queryClient, updated.id),
  });
}

export type { StoreResponseDto };
