"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSupplierDto, SupplierResponseDto, UpdateSupplierDto } from "@klickit/contracts";
import {
  blacklistSupplier,
  computeSupplierRating,
  createSupplier,
  getSupplier,
  listSuppliers,
  reactivateSupplier,
  searchSuppliers,
  setManualRating,
  updateSupplier,
  type SupplierStatus,
} from "../api/suppliers.api";

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — `["procurement",
 * "suppliers"]` query-key convention mirrors `features/accounting/hooks/use-accounts.ts`'s
 * own `ACCOUNTS_QUERY_KEY`, namespaced under `"procurement"` since this
 * feature folder will grow further Module 12 sub-domains (requisitions,
 * purchase orders, GRNs, …) in future slices, the same "one shared feature
 * root, namespaced query keys per sub-domain" shape `features/accounting/`
 * already established.
 */
export const SUPPLIERS_QUERY_KEY = ["procurement", "suppliers"] as const;

function listKey(status?: SupplierStatus) {
  return [...SUPPLIERS_QUERY_KEY, "list", status] as const;
}

function searchKey(q: string, limit?: number) {
  return [...SUPPLIERS_QUERY_KEY, "search", q, limit] as const;
}

function detailKey(id: string | undefined) {
  return [...SUPPLIERS_QUERY_KEY, "detail", id] as const;
}

/** `procurement:supplier:view`-gated. */
export function useSuppliers(status?: SupplierStatus, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listKey(status),
    queryFn: () => listSuppliers(status),
    enabled: options.enabled ?? true,
  });
}

/**
 * Trigram search (`GET .../search`) — a genuinely separate endpoint from
 * `useSuppliers()`, not a client-side filter over it. `q` is deliberately
 * NOT trimmed/validated here (the caller, `supplier-search-bar.tsx` +
 * the list page, already only enables this query once `q` is non-empty
 * post-debounce) so this hook stays a thin, honest mirror of the API.
 */
export function useSupplierSearch(q: string, limit?: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: searchKey(q, limit),
    queryFn: () => searchSuppliers(q, limit),
    enabled: (options.enabled ?? true) && q.length > 0,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getSupplier(id as string), enabled: !!id });
}

/** Invalidates every list/search query (status/q-keyed, so a broad prefix invalidation is the only correct way) plus this one supplier's detail, if known. */
function invalidateSupplierQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSupplierDto) => createSupplier(dto),
    onSuccess: () => invalidateSupplierQueries(queryClient),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSupplierDto }) => updateSupplier(id, dto),
    onSuccess: (updated) => invalidateSupplierQueries(queryClient, updated.id),
  });
}

export function useBlacklistSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => blacklistSupplier(id, reason),
    onSuccess: (updated) => invalidateSupplierQueries(queryClient, updated.id),
  });
}

export function useReactivateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateSupplier(id),
    onSuccess: (updated) => invalidateSupplierQueries(queryClient, updated.id),
  });
}

export function useComputeSupplierRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => computeSupplierRating(id),
    onSuccess: (updated) => invalidateSupplierQueries(queryClient, updated.id),
  });
}

export function useSetManualRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score }: { id: string; score: number }) => setManualRating(id, score),
    onSuccess: (updated) => invalidateSupplierQueries(queryClient, updated.id),
  });
}

export type { SupplierResponseDto, SupplierStatus };
