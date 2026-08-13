"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaptureSupplierInvoiceDto, ResolveMatchExceptionDto, SupplierInvoiceResponseDto } from "@klickit/contracts";
import {
  captureSupplierInvoice,
  getSupplierInvoice,
  listSupplierInvoices,
  matchSupplierInvoice,
  postSupplierInvoice,
  resolveSupplierInvoiceException,
  type ListSupplierInvoicesFilters,
} from "../api/supplier-invoices.api";

/** `["procurement", "supplier-invoices"]` — namespaced under `"procurement"`, the same shape every other sub-domain hook in this feature folder already established. */
export const SUPPLIER_INVOICES_QUERY_KEY = ["procurement", "supplier-invoices"] as const;

function listKey(filters: ListSupplierInvoicesFilters) {
  return [...SUPPLIER_INVOICES_QUERY_KEY, "list", filters.status, filters.supplierId] as const;
}

function detailKey(id: string | undefined) {
  return [...SUPPLIER_INVOICES_QUERY_KEY, "detail", id] as const;
}

export function useSupplierInvoices(filters: ListSupplierInvoicesFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listSupplierInvoices(filters) });
}

export function useSupplierInvoice(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getSupplierInvoice(id as string), enabled: !!id });
}

function invalidateSupplierInvoiceQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: SUPPLIER_INVOICES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCaptureSupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CaptureSupplierInvoiceDto) => captureSupplierInvoice(dto),
    onSuccess: (created) => invalidateSupplierInvoiceQueries(queryClient, created.id),
  });
}

/** Can genuinely land on either `MATCHED` or `MATCH_EXCEPTION` — `<InvoiceMatchPanel>` renders whichever real outcome comes back, not assumed success. */
export function useMatchSupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => matchSupplierInvoice(id),
    onSuccess: (updated) => invalidateSupplierInvoiceQueries(queryClient, updated.id),
  });
}

export function useResolveSupplierInvoiceException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ResolveMatchExceptionDto }) => resolveSupplierInvoiceException(id, dto),
    onSuccess: (updated) => invalidateSupplierInvoiceQueries(queryClient, updated.id),
  });
}

export function usePostSupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postSupplierInvoice(id),
    onSuccess: (updated) => invalidateSupplierInvoiceQueries(queryClient, updated.id),
  });
}

export type { SupplierInvoiceResponseDto };
export type { SupplierInvoiceStatus, ListSupplierInvoicesFilters } from "../api/supplier-invoices.api";
export { SUPPLIER_INVOICE_STATUSES } from "../api/supplier-invoices.api";
