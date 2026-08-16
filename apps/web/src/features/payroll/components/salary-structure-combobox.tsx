"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useSalaryStructures } from "../hooks/use-salary-structures";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — a small, REUSABLE salary
 * structure picker wired directly to Part 2's own `useSalaryStructures()`
 * hook, mirroring `component-combobox.tsx`/`employee-combobox.tsx`'s exact
 * shape. Built standalone for the same reason as `employee-combobox.tsx` —
 * later parts (Payroll Runs' own preview/compute screens) may need the
 * identical picker.
 *
 * Labels each item `name (grade)` when `grade` is set, plain `name`
 * otherwise (`grade` is genuinely optional/free-text, confirmed by reading
 * `PyrlSalaryStructureResponseDto` directly — not every structure has one).
 */
export function SalaryStructureCombobox({
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
  const structuresQuery = useSalaryStructures();

  const items = React.useMemo(
    () => (structuresQuery.data ?? []).map((s) => ({ value: s.id, label: s.grade ? `${s.name} (${s.grade})` : s.name })),
    [structuresQuery.data],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={structuresQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || structuresQuery.isLoading}
    />
  );
}
