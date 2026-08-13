"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePaymentVoucherDto, PaymentVoucherResponseDto } from "@klickit/contracts";
import {
  approvePaymentVoucher,
  createPaymentVoucher,
  executePaymentVoucher,
  getPaymentVoucher,
  listPaymentVoucherAllocations,
  listPaymentVouchers,
  rejectPaymentVoucher,
  submitPaymentVoucher,
  type ListPaymentVouchersFilters,
} from "../api/payment-vouchers.api";
import { SUPPLIER_INVOICES_QUERY_KEY } from "./use-supplier-invoices";

/** `["procurement", "payment-vouchers"]` — namespaced under `"procurement"`, the same shape every other sub-domain hook in this feature folder already established. */
export const PAYMENT_VOUCHERS_QUERY_KEY = ["procurement", "payment-vouchers"] as const;

function listKey(filters: ListPaymentVouchersFilters) {
  return [...PAYMENT_VOUCHERS_QUERY_KEY, "list", filters.status, filters.supplierId] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYMENT_VOUCHERS_QUERY_KEY, "detail", id] as const;
}

function allocationsKey(id: string | undefined) {
  return [...PAYMENT_VOUCHERS_QUERY_KEY, "allocations", id] as const;
}

export function usePaymentVouchers(filters: ListPaymentVouchersFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listPaymentVouchers(filters) });
}

export function usePaymentVoucher(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getPaymentVoucher(id as string), enabled: !!id });
}

export function usePaymentVoucherAllocations(id: string | undefined) {
  return useQuery({ queryKey: allocationsKey(id), queryFn: () => listPaymentVoucherAllocations(id as string), enabled: !!id });
}

function invalidatePaymentVoucherQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: PAYMENT_VOUCHERS_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: allocationsKey(id) });
  }
}

export function useCreatePaymentVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePaymentVoucherDto) => createPaymentVoucher(dto),
    onSuccess: (created) => invalidatePaymentVoucherQueries(queryClient, created.id),
  });
}

export function useSubmitPaymentVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitPaymentVoucher(id),
    onSuccess: (updated) => invalidatePaymentVoucherQueries(queryClient, updated.id),
  });
}

export function useApprovePaymentVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approvePaymentVoucher(id),
    onSuccess: (updated) => invalidatePaymentVoucherQueries(queryClient, updated.id),
  });
}

export function useRejectPaymentVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectPaymentVoucher(id),
    onSuccess: (updated) => invalidatePaymentVoucherQueries(queryClient, updated.id),
  });
}

/**
 * `execute()` also updates every allocated supplier invoice's own
 * `paidAmount`/`status` server-side (`PaymentVouchersService.execute()`) —
 * this mutation invalidates `SUPPLIER_INVOICES_QUERY_KEY` too, mirroring
 * `use-grn.ts`'s own `PURCHASE_ORDERS_QUERY_KEY` cross-invalidation (Part
 * 4), so a still-open supplier-invoice detail/list view refreshes to its new
 * `paidAmount`/status without a manual reload.
 */
export function useExecutePaymentVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => executePaymentVoucher(id),
    onSuccess: (updated) => {
      invalidatePaymentVoucherQueries(queryClient, updated.id);
      queryClient.invalidateQueries({ queryKey: SUPPLIER_INVOICES_QUERY_KEY });
    },
  });
}

export type { PaymentVoucherResponseDto };
export type { PaymentVoucherStatus, PaymentVoucherMethod, ListPaymentVouchersFilters } from "../api/payment-vouchers.api";
export { PAYMENT_VOUCHER_STATUSES, PAYMENT_VOUCHER_METHODS, isDraftPlaceholderNumber } from "../api/payment-vouchers.api";
