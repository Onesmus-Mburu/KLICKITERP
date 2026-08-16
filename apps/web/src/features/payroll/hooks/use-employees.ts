"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PyrlEmployeeResponseDto } from "@klickit/contracts";
import {
  createEmployee,
  exitEmployee,
  getEmployee,
  getEmployeeDecrypted,
  listEmployees,
  searchEmployees,
  updateEmployee,
  type CreateEmployeeInput,
  type ListPyrlEmployeesParams,
  type UpdateEmployeeInput,
} from "../api/employees.api";

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — `["payroll",
 * "employees"]` query-key root, namespaced under `"payroll"` since this
 * feature folder will grow further Module 15 sub-domains (salary structures,
 * assignments, loans, one-offs, statutory tables, runs, …) in future parts —
 * the same "one shared feature root, namespaced query keys per sub-domain"
 * shape `features/banking/`/`features/procurement/` already established.
 */
export const PAYROLL_EMPLOYEES_QUERY_KEY = ["payroll", "employees"] as const;

function listKey(params: ListPyrlEmployeesParams) {
  return [...PAYROLL_EMPLOYEES_QUERY_KEY, "list", params] as const;
}

function searchKey(q: string) {
  return [...PAYROLL_EMPLOYEES_QUERY_KEY, "search", q] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_EMPLOYEES_QUERY_KEY, "detail", id] as const;
}

function decryptedKey(id: string | undefined) {
  return [...PAYROLL_EMPLOYEES_QUERY_KEY, "decrypted", id] as const;
}

/** `payroll:employee:view`-gated — a role without it hits `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useEmployees(params: ListPyrlEmployeesParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listEmployees(params), enabled: options.enabled ?? true });
}

/** Trigram search (`GET .../search`) — a genuinely separate endpoint from `useEmployees()`, not a client-side filter over it. Only enabled once `q` is non-empty, mirroring `features/procurement/hooks/use-suppliers.ts`'s own `useSupplierSearch()`. */
export function useEmployeeSearch(q: string, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: searchKey(q), queryFn: () => searchEmployees(q), enabled: (options.enabled ?? true) && q.length > 0 });
}

export function useEmployee(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getEmployee(id as string), enabled: !!id });
}

/**
 * `payroll:employee:manage`-gated (NOT `:view`) — real plaintext
 * `payDetails`/`bankName`/`branch`/`account`. `enabled` defaults to `false`:
 * this must only ever fire on the explicit "View bank & ID details" action in
 * `employee-bank-details-panel.tsx`, never automatically on page load — see
 * that component's own doc comment.
 */
export function useEmployeeDecrypted(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: decryptedKey(id),
    queryFn: () => getEmployeeDecrypted(id as string),
    enabled: !!id && (options.enabled ?? false),
  });
}

function invalidateEmployeeQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: PAYROLL_EMPLOYEES_QUERY_KEY });
  if (id) {
    queryClient.invalidateQueries({ queryKey: detailKey(id) });
    queryClient.invalidateQueries({ queryKey: decryptedKey(id) });
  }
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: () => invalidateEmployeeQueries(queryClient),
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEmployeeInput }) => updateEmployee(id, dto),
    onSuccess: (updated) => invalidateEmployeeQueries(queryClient, updated.id),
  });
}

/** BR-PYRL-04 — `isActive=false`, `exitDate` set. */
export function useExitEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, exitDate }: { id: string; exitDate: string }) => exitEmployee(id, exitDate),
    onSuccess: (updated) => invalidateEmployeeQueries(queryClient, updated.id),
  });
}

export type { PyrlEmployeeResponseDto };
