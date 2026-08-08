"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export interface FeeCategoryChipOption {
  value: string;
  label: string;
}

/** Above this option count, the chip row gains a filter `<Input>` and a bounded-height scroll container. At or below it (the common case), rendering is byte-for-byte the same single `flex flex-wrap` row this component has always used — no filter box, no scroll container. */
const FILTER_THRESHOLD = 12;

/**
 * Slice 0 (Phase 6 Slice 8) — an always-visible row of toggle chips for
 * picking fee categories on the new bulk "Generate Invoice" screen, modeled
 * on the legacy reference screenshot's category-chip UX. `MultiSelect`
 * (`components/ui/select.tsx`) is a dropdown that only summarizes its
 * selection as "N selected" once closed — the wrong shape here, where every
 * option should stay visible and directly clickable at once (per the plan's
 * own note, deliberately not reused). Purely presentational —
 * options/selected/onChange props only, no data fetching.
 *
 * Phase 6 Slice 9 (Part C) — gained overflow handling for schools with many
 * fee categories: once `options.length > FILTER_THRESHOLD`, a small filter
 * `<Input>` (300ms-debounced via the shared `useDebouncedValue()` hook, Part
 * B) narrows which chips are VISIBLE, and the chip row becomes a bounded-
 * height (`max-h-48`), scrollable container. Filtering NEVER touches
 * `selected`/`onChange` — `toggle()` still closes over the full, unfiltered
 * `options` array by `option.value` regardless of what's currently visible,
 * so a chip already selected stays selected even once scrolled/filtered out
 * of view (verified explicitly — see `docs/phase-6/PROGRESS.md`'s Slice 9
 * write-up for the concrete case exercised). A short list
 * (`options.length <= FILTER_THRESHOLD`, the common case) takes the early
 * return below and renders through the EXACT SAME markup this component used
 * before this pass — a real, deliberately-checked non-regression.
 */
export function FeeCategoryChipPicker({
  options,
  selected,
  onChange,
}: {
  options: FeeCategoryChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("billing.feeCategoryChipPicker");
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const [filterDraft, setFilterDraft] = React.useState("");
  const debouncedFilter = useDebouncedValue(filterDraft, 300);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function renderChip(option: FeeCategoryChipOption) {
    const active = selectedSet.has(option.value);
    return (
      <button
        key={option.value}
        type="button"
        aria-pressed={active}
        onClick={() => toggle(option.value)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          active
            ? "border-transparent bg-primary text-primary-foreground"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        {option.label}
      </button>
    );
  }

  if (options.length <= FILTER_THRESHOLD) {
    return <div className="flex flex-wrap gap-2">{options.map(renderChip)}</div>;
  }

  const query = debouncedFilter.trim().toLowerCase();
  const visibleOptions = query.length === 0 ? options : options.filter((option) => option.label.toLowerCase().includes(query));

  return (
    <div className="space-y-2">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t("filterPlaceholder")}
          value={filterDraft}
          onChange={(e) => setFilterDraft(e.target.value)}
        />
      </div>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border p-2">
        {visibleOptions.length === 0 ? (
          <p className="w-full py-2 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
        ) : (
          visibleOptions.map(renderChip)
        )}
      </div>
    </div>
  );
}
