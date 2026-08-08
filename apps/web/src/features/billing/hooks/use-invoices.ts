"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GenerateInvoiceDto, VoidInvoiceDto } from "@klickit/contracts";
import {
  generateInvoice,
  getInvoice,
  listInvoiceLines,
  listInvoicesForStudent,
  listPendingInvoices,
  listUpcomingInvoices,
  postInvoice,
  voidInvoice,
  type ListOpenInvoicesParams,
} from "../api/invoices.api";

export const INVOICES_QUERY_KEY = ["billing", "invoices"] as const;

function studentInvoicesKey(studentId: string | undefined) {
  return [...INVOICES_QUERY_KEY, "student", studentId] as const;
}
function detailKey(id: string | undefined) {
  return [...INVOICES_QUERY_KEY, "detail", id] as const;
}
function linesKey(id: string | undefined) {
  return [...INVOICES_QUERY_KEY, "lines", id] as const;
}

export function useStudentInvoices(studentId: string | undefined) {
  return useQuery({
    queryKey: studentInvoicesKey(studentId),
    queryFn: () => listInvoicesForStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getInvoice(id as string),
    enabled: !!id,
  });
}

export function useInvoiceLines(id: string | undefined) {
  return useQuery({
    queryKey: linesKey(id),
    queryFn: () => listInvoiceLines(id as string),
    enabled: !!id,
  });
}

/** Invalidates the generating student's invoice list on success — a real 409 (BR-BILL-04, already billed) is left for the caller to catch via `isAlreadyBilledInvoiceError` and render as the specific friendly message, not a generic one (see `../lib/errors.ts`). */
export function useGenerateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: GenerateInvoiceDto) => generateInvoice(dto),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(invoice.studentId) });
    },
  });
}

/** A real 404 (GL control account not configured) is left for the caller to catch via `isGlNotConfiguredError` and render as the distinct "contact your administrator" state (see `../lib/errors.ts`). On success, also invalidates `["students","ledger",studentId]` (Slice 2's `use-ledger.ts` query key) — posting realizes a real new `std_ledger_entry` row, so the student's ledger view should refetch, not stay stale. */
export function usePostInvoice(invoiceId: string, studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
    },
  });
}

export function useVoidInvoice(invoiceId: string, studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: VoidInvoiceDto) => voidInvoice(invoiceId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
    },
  });
}

/**
 * Phase 6 Slice 8 (Part 2) — the Pending/Upcoming invoice list screens.
 * `params` is the whole query key (same convention `useStudents()` already
 * established) — a page/pageSize change is a genuinely different query,
 * correctly cache-keyed rather than silently reusing a stale entry.
 *
 * `useOpenInvoices(bucket, params)` is the single underlying `useQuery` call
 * — `bucket` only selects WHICH plain async function `queryFn` invokes, it
 * never branches which HOOK gets called, so `<OpenInvoicesTable bucket=.../>`
 * (`features/billing/components/open-invoices-table.tsx`) can take `bucket`
 * as a prop and call this one hook without violating rules-of-hooks (calling
 * `usePendingInvoices()`/`useUpcomingInvoices()` conditionally based on a
 * prop would fire two real queries per render or trip the linter, neither
 * acceptable). `usePendingInvoices()`/`useUpcomingInvoices()` themselves stay
 * exported as the plain, bucket-fixed convenience wrappers the plan asks
 * for, for any future caller that only ever wants one specific bucket.
 */
export function useOpenInvoices(bucket: "PENDING" | "UPCOMING", params: ListOpenInvoicesParams = {}) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, bucket === "PENDING" ? "pending" : "upcoming", params],
    queryFn: () => (bucket === "PENDING" ? listPendingInvoices(params) : listUpcomingInvoices(params)),
  });
}

export function usePendingInvoices(params: ListOpenInvoicesParams = {}) {
  return useOpenInvoices("PENDING", params);
}

export function useUpcomingInvoices(params: ListOpenInvoicesParams = {}) {
  return useOpenInvoices("UPCOMING", params);
}
