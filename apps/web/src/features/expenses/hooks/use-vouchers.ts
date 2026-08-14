"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateVoucherDto, UpdateVoucherDto, VoucherResponseDto } from "@klickit/contracts";
import {
  approveVoucher,
  createVoucher,
  getVoucher,
  isDraftPlaceholderNumber,
  listVouchers,
  payVoucher,
  rejectVoucher,
  submitVoucher,
  updateVoucher,
  VOUCHER_METHODS,
  VOUCHER_PAYEE_TYPES,
  VOUCHER_STATUSES,
  type VoucherMethod,
  type VoucherPayeeType,
  type VoucherStatus,
} from "../api/vouchers.api";

/** `["expenses", "vouchers"]` — namespaced under `"expenses"` alongside `EXPENSE_CATEGORIES_QUERY_KEY`, the same shared-feature-root shape `features/procurement/hooks/*.ts` already established for its own sub-domains. */
export const EXPENSE_VOUCHERS_QUERY_KEY = ["expenses", "vouchers"] as const;

function listKey(status?: VoucherStatus) {
  return [...EXPENSE_VOUCHERS_QUERY_KEY, "list", status] as const;
}

function detailKey(id: string | undefined) {
  return [...EXPENSE_VOUCHERS_QUERY_KEY, "detail", id] as const;
}

/** `expenses:voucher:create`-gated (reused for every GET too, no separate view permission — see `vouchers.api.ts`'s own doc comment). */
export function useVouchers(status?: VoucherStatus) {
  return useQuery({ queryKey: listKey(status), queryFn: () => listVouchers(status) });
}

export function useVoucher(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getVoucher(id as string), enabled: !!id });
}

/** Every list query (status-keyed) is invalidated broadly — a status-transition mutation can affect any status-filtered view currently on screen, the same reasoning `use-suppliers.ts`'s own `invalidateSupplierQueries()` documents. */
function invalidateVoucherQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: EXPENSE_VOUCHERS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateVoucherDto) => createVoucher(dto),
    onSuccess: () => invalidateVoucherQueries(queryClient),
  });
}

export function useUpdateVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVoucherDto }) => updateVoucher(id, dto),
    onSuccess: (updated) => invalidateVoucherQueries(queryClient, updated.id),
  });
}

/** `expenses:voucher:submit`-gated. See `vouchers.api.ts`'s own doc comment on `submitVoucher()` for BR-EXP-03's real rejection — `<VoucherStatusActions>` is the caller responsible for surfacing it clearly. */
export function useSubmitVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitVoucher(id),
    onSuccess: (updated) => invalidateVoucherQueries(queryClient, updated.id),
  });
}

/** `expenses:voucher:decide`-gated. */
export function useApproveVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveVoucher(id),
    onSuccess: (updated) => invalidateVoucherQueries(queryClient, updated.id),
  });
}

/** `expenses:voucher:decide`-gated. */
export function useRejectVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectVoucher(id),
    onSuccess: (updated) => invalidateVoucherQueries(queryClient, updated.id),
  });
}

/** `expenses:voucher:pay`-gated. */
export function usePayVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payVoucher(id),
    onSuccess: (updated) => invalidateVoucherQueries(queryClient, updated.id),
  });
}

export {
  isDraftPlaceholderNumber,
  VOUCHER_METHODS,
  VOUCHER_PAYEE_TYPES,
  VOUCHER_STATUSES,
  type VoucherMethod,
  type VoucherPayeeType,
  type VoucherResponseDto,
  type VoucherStatus,
};
