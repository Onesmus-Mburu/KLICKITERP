"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useComponents } from "../hooks/use-components";

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — a small, REUSABLE payroll
 * component picker wired directly to Part 1's own `useComponents()` hook
 * (`features/payroll/hooks/use-components.ts`). Built as a standalone piece
 * (not a private sub-component of `structure-line-editor.tsx`) because later
 * parts of this module — employee-component overrides, one-off components —
 * will need the exact same picker, per this part's own task brief.
 *
 * Labels each item `code — name` (e.g. `HOUSE_ALLOWANCE — House Allowance`)
 * so a user can tell the 8 real seeded rows apart from any custom component
 * created later purely by name — `code` is the permanent, load-bearing
 * identifier Part 1's own `create-component-dialog.tsx` already establishes
 * as the thing that actually matters here.
 */
export function ComponentCombobox({
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
  const componentsQuery = useComponents();

  const items = React.useMemo(
    () => (componentsQuery.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [componentsQuery.data],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={componentsQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || componentsQuery.isLoading}
    />
  );
}
