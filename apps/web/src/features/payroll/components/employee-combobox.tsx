"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useEmployees } from "../hooks/use-employees";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — a small, REUSABLE payroll
 * employee picker wired directly to Part 1's own `useEmployees()` hook
 * (`features/payroll/hooks/use-employees.ts`), mirroring
 * `component-combobox.tsx`'s exact shape (Part 2). Built as a standalone
 * piece (not a private sub-component of the assignment/override panels)
 * because later parts of this module — Loans, One-offs, Payroll Runs — will
 * need the identical picker, per this part's own task brief.
 *
 * Labels each item `staffNo — fullName` (e.g. `EMP-0042 — Jane Wanjiru`), the
 * same "permanent identifier first, human name second" shape
 * `component-combobox.tsx` establishes for `code — name`. No `isActive`
 * filter applied by default — this stays a plain, unfiltered picker over the
 * full employee list, the same simplicity `component-combobox.tsx` keeps;
 * callers needing an active-only picker can filter `useEmployees()`'s own
 * `isActive` param upstream in a future part if that need arises.
 */
export function EmployeeCombobox({
  value,
  onChange,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyText,
  loadingText,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
}) {
  const employeesQuery = useEmployees();

  const items = React.useMemo(
    () => (employeesQuery.data ?? []).map((e) => ({ value: e.id, label: `${e.staffNo} — ${e.fullName}` })),
    [employeesQuery.data],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={employeesQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || employeesQuery.isLoading}
    />
  );
}
