"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountResponseDto, AccountTreeNodeResponseDto, CreateAccountDto, UpdateAccountDto } from "@klickit/contracts";
import {
  activateAccount,
  createAccount,
  deactivateAccount,
  deleteAccount,
  getAccount,
  getAccountsTree,
  listAccounts,
  updateAccount,
  type ListAccountsParams,
} from "../api/accounts.api";

/** `["accounting", "accounts"]` query-key convention mirrors `features/departments/hooks/use-departments.ts`'s own `DEPARTMENTS_QUERY_KEY`, namespaced under `"accounting"` since this feature folder covers 3 sibling sub-domains (accounts/fiscal-years/cost-centers) sharing one `features/accounting/` tree. */
export const ACCOUNTS_QUERY_KEY = ["accounting", "accounts"] as const;
export const ACCOUNTS_TREE_QUERY_KEY = [...ACCOUNTS_QUERY_KEY, "tree"] as const;

function listKey(params: ListAccountsParams) {
  return [...ACCOUNTS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...ACCOUNTS_QUERY_KEY, "detail", id] as const;
}

/** `accounting:account:view`-gated. Backs the "select a parent account" picker in `create-account-dialog.tsx` — no `isPostable` filter param exists on the real controller, so callers filter the returned flat list client-side (see that dialog's own doc comment). */
export function useAccounts(params: ListAccountsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listAccounts(params) });
}

/** The Chart of Accounts screen's primary, pre-assembled hierarchy — `<AccountTree>`'s own data source. */
export function useAccountsTree() {
  return useQuery({ queryKey: ACCOUNTS_TREE_QUERY_KEY, queryFn: getAccountsTree });
}

export function useAccount(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getAccount(id as string), enabled: !!id });
}

/** Every mutation below invalidates BOTH the flat list and the tree — the tree is the primary screen, the flat list only backs the parent-account picker, and a create/update/status change can affect what either shows. */
function invalidateAccountQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAccountDto) => createAccount(dto),
    onSuccess: () => invalidateAccountQueries(queryClient),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAccountDto }) => updateAccount(id, dto),
    onSuccess: (updated) => invalidateAccountQueries(queryClient, updated.id),
  });
}

export function useDeactivateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateAccount(id),
    onSuccess: (updated) => invalidateAccountQueries(queryClient, updated.id),
  });
}

export function useActivateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateAccount(id),
    onSuccess: (updated) => invalidateAccountQueries(queryClient, updated.id),
  });
}

/** Rejected with a real 409 if the account has journal-line postings — callers catch `ApiError`/`status === 409` and show "deactivate instead" copy (see `accounts.api.ts`'s own `deleteAccount()` doc comment). */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (_data, id) => invalidateAccountQueries(queryClient, id),
  });
}

export type { AccountResponseDto, AccountTreeNodeResponseDto };
