"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractResponseDto, CreateContractDto, UpdateContractDto } from "@klickit/contracts";
import {
  createContract,
  getContract,
  listContracts,
  listContractsExpiringSoon,
  markContractExpired,
  terminateContract,
  updateContract,
  type ListContractsFilters,
} from "../api/contracts.api";

/** `["procurement", "contracts"]` — namespaced under `"procurement"`, the same shape every other sub-domain hook in this feature folder already established. */
export const CONTRACTS_QUERY_KEY = ["procurement", "contracts"] as const;

function listKey(filters: ListContractsFilters) {
  return [...CONTRACTS_QUERY_KEY, "list", filters.status, filters.supplierId] as const;
}

function detailKey(id: string | undefined) {
  return [...CONTRACTS_QUERY_KEY, "detail", id] as const;
}

function expiringSoonKey(withinDays: number | undefined) {
  return [...CONTRACTS_QUERY_KEY, "expiring-soon", withinDays] as const;
}

export function useContracts(filters: ListContractsFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listContracts(filters) });
}

export function useContract(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getContract(id as string), enabled: !!id });
}

/** No `withinDays` arg -> the per-contract-default behavior (each row's own `renewalAlertDays` applies) — see `contracts.api.ts`'s own doc comment on `listContractsExpiringSoon()`, and `expiring-contracts-widget.tsx`'s own doc comment for why that's the right default for a dashboard-style widget. */
export function useContractsExpiringSoon(withinDays?: number) {
  return useQuery({ queryKey: expiringSoonKey(withinDays), queryFn: () => listContractsExpiringSoon(withinDays) });
}

function invalidateContractQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: CONTRACTS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateContractDto) => createContract(dto),
    onSuccess: (created) => invalidateContractQueries(queryClient, created.id),
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateContractDto }) => updateContract(id, dto),
    onSuccess: (updated) => invalidateContractQueries(queryClient, updated.id),
  });
}

export function useTerminateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => terminateContract(id),
    onSuccess: (updated) => invalidateContractQueries(queryClient, updated.id),
  });
}

export function useMarkContractExpired() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markContractExpired(id),
    onSuccess: (updated) => invalidateContractQueries(queryClient, updated.id),
  });
}

export type { ContractResponseDto };
export type { ContractStatus, ListContractsFilters } from "../api/contracts.api";
export { CONTRACT_STATUSES } from "../api/contracts.api";
