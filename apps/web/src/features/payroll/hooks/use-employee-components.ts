"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddEmployeeComponentDto, EndEmployeeComponentDto, PyrlEmployeeComponentResponseDto } from "@klickit/contracts";
import { addEmployeeComponent, endEmployeeComponent, getActiveEmployeeComponents, listEmployeeComponents } from "../api/employee-components.api";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — `["payroll",
 * "employee-components", employeeId]` query-key root, genuinely scoped by
 * `employeeId` — same "no global list, real API shape drives the key root"
 * reasoning `use-employee-assignments.ts` documents for its own sibling.
 */
export function payrollEmployeeComponentsQueryKey(employeeId: string | undefined) {
  return ["payroll", "employee-components", employeeId] as const;
}

function activeKey(employeeId: string | undefined, date: string) {
  return [...payrollEmployeeComponentsQueryKey(employeeId), "active", date] as const;
}

export function useEmployeeComponents(employeeId: string | undefined) {
  return useQuery({
    queryKey: payrollEmployeeComponentsQueryKey(employeeId),
    queryFn: () => listEmployeeComponents(employeeId as string),
    enabled: !!employeeId,
  });
}

/** An ARRAY — several different components can be concurrently active for the same employee on the same date, unlike assignments' single-or-null. */
export function useActiveEmployeeComponents(employeeId: string | undefined, date: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: activeKey(employeeId, date),
    queryFn: () => getActiveEmployeeComponents(employeeId as string, date),
    enabled: !!employeeId && !!date && (options.enabled ?? true),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, employeeId: string) {
  queryClient.invalidateQueries({ queryKey: payrollEmployeeComponentsQueryKey(employeeId) });
}

/** Surfaces the real `409` (`excl_pyrl_employee_component_no_overlap`, scoped to `(employeeId, componentId)`) verbatim via `ApiError.message` on a caught conflict — see `employee-components.api.ts`'s own doc comment. */
export function useAddEmployeeComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AddEmployeeComponentDto) => addEmployeeComponent(dto),
    onSuccess: (created) => invalidate(queryClient, created.employeeId),
  });
}

/** Closes ONE specific open-ended override (`componentId` in the body) — real `404` if none is open for that pair. */
export function useEndEmployeeComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: EndEmployeeComponentDto }) => endEmployeeComponent(employeeId, dto),
    onSuccess: (updated) => invalidate(queryClient, updated.employeeId),
  });
}

export type { PyrlEmployeeComponentResponseDto };
