"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankAccountResponseDto, CreateBankAccountDto, UpdateBankAccountDto } from "@klickit/contracts";
import { createAccount, getAccount, listAccounts, updateAccount, type ListBankAccountsParams } from "../api/accounts.api";

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) — `["banking",
 * "accounts"]` query-key convention mirrors `features/accounting/hooks/use-accounts.ts`'s
 * own shape, namespaced under `"banking"` since this feature folder will grow
 * further Module 16 sub-domains (transfers, deposits/withdrawals, cheque
 * books/leaves, reconciliation, …) in future parts — the same "one shared
 * feature root, namespaced query keys per sub-domain" pattern every other
 * multi-part module's own `features/<module>/` tree already established.
 */
export const BANKING_ACCOUNTS_QUERY_KEY = ["banking", "accounts"] as const;

function listKey(params: ListBankAccountsParams) {
  return [...BANKING_ACCOUNTS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_ACCOUNTS_QUERY_KEY, "detail", id] as const;
}

/** `banking:account:manage`-gated — the ONE shared permission every route on `AccountsController` uses, including this list (see `accounts.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useAccounts(params: ListBankAccountsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listAccounts(params) });
}

export function useAccount(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getAccount(id as string), enabled: !!id });
}

function invalidateAccountQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: BANKING_ACCOUNTS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBankAccountDto) => createAccount(dto),
    onSuccess: () => invalidateAccountQueries(queryClient),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateBankAccountDto }) => updateAccount(id, dto),
    onSuccess: (updated) => invalidateAccountQueries(queryClient, updated.id),
  });
}

export type { BankAccountResponseDto };
