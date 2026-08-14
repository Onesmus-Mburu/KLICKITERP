"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useItemSearch } from "../hooks/use-items";

const SEARCH_LIMIT = 20;

export interface SelectedInventoryItem {
  id: string;
  code: string;
  name: string;
}

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — a debounced
 * search-as-you-type item picker over `ItemsController.search()`'s trigram
 * endpoint (`GET /inventory/items/search`, `useItemSearch()`), built on the
 * shared `<Combobox>` primitive's new `onQueryChange` escape hatch (see that
 * file's own doc comment) rather than a hand-rolled popover — the internal
 * search input's typed text drives `useDebouncedValue()` (300ms, this app's
 * standard debounce interval) -> `useItemSearch()`, and the live results
 * become `<Combobox>`'s own `items` prop; `<Combobox>`'s internal
 * client-side substring filter is skipped entirely (via `onQueryChange`)
 * since a trigram match can legitimately not contain the typed text as a
 * literal substring.
 *
 * **Deliberately GENERIC, not Inventory-specific in its own props** — per
 * this part's own explicit requirement, this component is reused AS-IS from
 * `features/procurement/components/requisition-line-editor.tsx`/`po-line-editor.tsx`
 * (the item-picker retrofit) without any Procurement-specific branching
 * inside this file: `onSelect(item: SelectedInventoryItem | null)` is the
 * only way this component talks to its caller, carrying just the 3 fields
 * (`id`/`code`/`name`) any caller could plausibly need (an `itemId` to store,
 * a human label to render/prefill).
 *
 * **Stateless about "what is currently selected"** — mirrors
 * `AssignDepartmentDialog`'s own head-of-department `<Combobox>` shape
 * (external `value`/an explicit `X` clear button, no internal selection
 * cache): the caller's own form/row state is the single source of truth for
 * `value` (an itemId, or `""` for "none"). `valueLabel` covers the case
 * where that id was set BEFORE this component's own live search ever ran
 * (e.g. editing an existing line, or re-opening the popover after typing a
 * different query that no longer includes the previously-picked item in its
 * results) — without it, `<Combobox>`'s own trigger would have no label to
 * show for a real, already-made selection and would silently fall back to
 * the placeholder.
 */
export function ItemCombobox({
  value,
  valueLabel,
  onSelect,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  valueLabel?: string;
  onSelect: (item: SelectedInventoryItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("inventory.items.itemCombobox");
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmedQuery = debouncedQuery.trim();
  const searchEnabled = trimmedQuery.length > 0;
  const searchQuery = useItemSearch(trimmedQuery, SEARCH_LIMIT, { enabled: searchEnabled });

  const results = React.useMemo(() => searchQuery.data ?? [], [searchQuery.data]);

  const items = React.useMemo(() => {
    const searchItems = results.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
    if (value && valueLabel && !searchItems.some((i) => i.value === value)) {
      return [{ value, label: valueLabel }, ...searchItems];
    }
    return searchItems;
  }, [results, value, valueLabel]);

  function handleChange(id: string) {
    if (!id) {
      onSelect(null);
      return;
    }
    const found = results.find((item) => item.id === id);
    onSelect(found ? { id: found.id, code: found.code, name: found.name } : null);
  }

  const emptyText = !searchEnabled ? t("typeToSearch") : searchQuery.isFetching ? t("searching") : t("noItemsFound");

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1">
        <Combobox
          items={items}
          value={value}
          onChange={handleChange}
          onQueryChange={setQuery}
          placeholder={placeholder ?? t("placeholder")}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={emptyText}
          disabled={disabled}
          className={className}
        />
      </div>
      {value && (
        <Button type="button" variant="outline" size="icon" onClick={() => onSelect(null)} aria-label={t("clear")}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
