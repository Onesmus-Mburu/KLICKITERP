"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignEmployeeDto, EndAssignmentDto, PyrlEmployeeAssignmentResponseDto } from "@klickit/contracts";
import { assignEmployee, endEmployeeAssignment, getActiveEmployeeAssignment, listEmployeeAssignments } from "../api/employee-assignments.api";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — `["payroll",
 * "employee-assignments", employeeId]` query-key root, genuinely scoped by
 * `employeeId` (not a bare `["payroll","employee-assignments"]` global root
 * like `use-employees.ts`'s own list) — matches the real API shape: every
 * route on `EmployeeAssignmentsController` requires an `employeeId` query
 * param, there is no global list to key a root query off of.
 */
export function payrollEmployeeAssignmentsQueryKey(employeeId: string | undefined) {
  return ["payroll", "employee-assignments", employeeId] as const;
}

function activeKey(employeeId: string | undefined, date: string) {
  return [...payrollEmployeeAssignmentsQueryKey(employeeId), "active", date] as const;
}

export function useEmployeeAssignments(employeeId: string | undefined) {
  return useQuery({
    queryKey: payrollEmployeeAssignmentsQueryKey(employeeId),
    queryFn: () => listEmployeeAssignments(employeeId as string),
    enabled: !!employeeId,
  });
}

/** Only fetched where a caller actually needs "what applies on date X" (not needed by the plain history panel, which lists everything). */
export function useActiveEmployeeAssignment(employeeId: string | undefined, date: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: activeKey(employeeId, date),
    queryFn: () => getActiveEmployeeAssignment(employeeId as string, date),
    enabled: !!employeeId && !!date && (options.enabled ?? true),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, employeeId: string) {
  queryClient.invalidateQueries({ queryKey: payrollEmployeeAssignmentsQueryKey(employeeId) });
}

/** Surfaces the real `409` (`excl_pyrl_employee_assignment_no_overlap`) verbatim via `ApiError.message` on a caught conflict — see `employee-assignments.api.ts`'s own doc comment. */
export function useAssignEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AssignEmployeeDto) => assignEmployee(dto),
    onSuccess: (created) => invalidate(queryClient, created.employeeId),
  });
}

/** Closes the currently open-ended assignment — real `404` (surfaced via `ApiError.message`) if none is open, see `employee-assignments.api.ts`'s own doc comment. */
export function useEndEmployeeAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: EndAssignmentDto }) => endEmployeeAssignment(employeeId, dto),
    onSuccess: (updated) => invalidate(queryClient, updated.employeeId),
  });
}

export type { PyrlEmployeeAssignmentResponseDto };
