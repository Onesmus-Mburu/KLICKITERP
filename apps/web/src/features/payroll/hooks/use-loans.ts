"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePyrlLoanDto, DecidePyrlLoanDto, PyrlLoanResponseDto, RecordLoanRecoveryDto, SettleLoanEarlyDto } from "@klickit/contracts";
import { createLoan, decideLoan, getLoan, getLoanSchedule, listLoansByEmployee, recordLoanRecovery, settleLoanEarly } from "../api/loans.api";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — `["payroll", "loans"]`
 * query-key root, per this part's own task brief: list keyed by
 * `[...root, employeeId]` (matches the real API shape — `GET
 * /payroll/loans` requires `employeeId`, there is no global list),
 * detail keyed by `[...root, "detail", id]`, schedule keyed by
 * `[...root, "detail", id, "schedule"]`.
 */
export const PAYROLL_LOANS_QUERY_KEY = ["payroll", "loans"] as const;

function listKey(employeeId: string | undefined) {
  return [...PAYROLL_LOANS_QUERY_KEY, employeeId] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_LOANS_QUERY_KEY, "detail", id] as const;
}

function scheduleKey(id: string | undefined) {
  return [...PAYROLL_LOANS_QUERY_KEY, "detail", id, "schedule"] as const;
}

/** `payroll:loan:create`-gated (reused for every read route, see `loans.api.ts`'s own doc comment). Only enabled once an employee is actually picked. */
export function useLoans(employeeId: string | undefined) {
  return useQuery({ queryKey: listKey(employeeId), queryFn: () => listLoansByEmployee(employeeId as string), enabled: !!employeeId });
}

export function useLoan(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getLoan(id as string), enabled: !!id });
}

/**
 * Genuinely empty (`[]`) before a loan reaches `ACTIVE`, and stays empty
 * forever for a `WRITTEN_OFF`-via-reject loan — both expected, not errors
 * (see `loans.api.ts`'s own doc comment). Callers that want to distinguish
 * "not applicable yet" from "genuinely fetched and empty" should gate this
 * hook's own `enabled` on the loan's `status` themselves (per-caller
 * knowledge, not baked in here) rather than relying on this hook to guess —
 * `loan-schedule-table.tsx` does exactly that.
 */
export function useLoanSchedule(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: scheduleKey(id), queryFn: () => getLoanSchedule(id as string), enabled: !!id && (options.enabled ?? true) });
}

/**
 * Every mutation below invalidates all 3 query-key shapes it could plausibly
 * affect (per this part's own task brief) — a loan action always changes the
 * detail row, and every write EXCEPT create also potentially changes the
 * schedule (decide GENERATES it; record-recovery/settle-early both mutate
 * existing rows), so invalidating all 3 unconditionally is simpler and safer
 * than trying to track exactly which one call site needs which subset.
 */
function invalidateLoanQueries(queryClient: ReturnType<typeof useQueryClient>, loan: PyrlLoanResponseDto) {
  queryClient.invalidateQueries({ queryKey: listKey(loan.employeeId) });
  queryClient.invalidateQueries({ queryKey: detailKey(loan.id) });
  queryClient.invalidateQueries({ queryKey: scheduleKey(loan.id) });
}

/** Surfaces the real `principal`/`termMonths` `ValidationException` messages verbatim on a 4xx — see `loans.api.ts`'s own doc comment. */
export function useCreateLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlLoanDto) => createLoan(dto),
    onSuccess: (created) => invalidateLoanQueries(queryClient, created),
  });
}

/**
 * `approved: true` is the ONLY moment the real amortization schedule is ever
 * generated — this mutation's `onSuccess` invalidating `scheduleKey` is what
 * makes a freshly-approved loan's schedule table actually populate without a
 * manual refresh.
 */
export function useDecideLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecidePyrlLoanDto }) => decideLoan(id, dto),
    onSuccess: (updated) => invalidateLoanQueries(queryClient, updated),
  });
}

export function useRecordLoanRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RecordLoanRecoveryDto }) => recordLoanRecovery(id, dto),
    onSuccess: (updated) => invalidateLoanQueries(queryClient, updated),
  });
}

export function useSettleLoanEarly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: SettleLoanEarlyDto }) => settleLoanEarly(id, dto),
    onSuccess: (updated) => invalidateLoanQueries(queryClient, updated),
  });
}

export type { PyrlLoanResponseDto };
