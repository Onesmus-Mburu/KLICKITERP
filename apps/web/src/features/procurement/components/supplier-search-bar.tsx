"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — a 300ms-debounced
 * (`useDebouncedValue()`, the shared primitive `app/(erp)/billing/receipts/page.tsx`
 * already established) live search-as-you-type box. Owns its own draft input
 * state internally (immediately responsive) and only calls
 * `onDebouncedQueryChange` with the SETTLED value — the caller
 * (`app/(erp)/procurement/suppliers/page.tsx`) decides what to do with it
 * (switch from the plain, optionally status-filtered list to
 * `GET .../search` once non-empty). No `MIN_SEARCH_LENGTH` gate here (unlike
 * `ReceiptsPage`'s own 2-character minimum for its free-text `q` filter on an
 * already-paginated list) — this box drives which ENDPOINT is called at all,
 * so even a 1-character query is a real, useful trigram search, not a filter
 * over an existing large result set.
 */
export interface SupplierSearchBarProps {
  onDebouncedQueryChange: (query: string) => void;
}

export function SupplierSearchBar({ onDebouncedQueryChange }: SupplierSearchBarProps) {
  const t = useTranslations("procurement.suppliers.list");
  const [draft, setDraft] = React.useState("");
  const debounced = useDebouncedValue(draft, 300);

  React.useEffect(() => {
    onDebouncedQueryChange(debounced.trim());
  }, [debounced, onDebouncedQueryChange]);

  return (
    <div className="relative sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" placeholder={t("searchPlaceholder")} value={draft} onChange={(e) => setDraft(e.target.value)} />
    </div>
  );
}
