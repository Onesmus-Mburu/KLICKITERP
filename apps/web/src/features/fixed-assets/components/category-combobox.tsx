"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useCategories } from "../hooks/use-categories";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — a small,
 * REUSABLE category picker wired directly to this part's own
 * `useCategories()` hook. Built as a standalone piece (not a private
 * sub-component of `create-asset-dialog.tsx`) because later parts of this
 * module — depreciation runs, and anywhere else a category needs picking —
 * will need the exact same combobox, per this part's own task brief.
 *
 * Labels each item `name (method, life months)` — e.g. `Furniture &
 * Fittings (Straight-Line, 60 mo)` — so the depreciation policy is visible
 * at a glance while picking, not just the bare name.
 */
export function CategoryCombobox({
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
  const categoriesQuery = useCategories();
  const tMethods = useTranslations("fixedAssets.categoryMethods");

  const items = React.useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} (${tMethods(c.method)}, ${c.lifeMonths} mo)`,
      })),
    [categoriesQuery.data, tMethods],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={categoriesQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || categoriesQuery.isLoading}
    />
  );
}
