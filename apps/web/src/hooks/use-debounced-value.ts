"use client";

import * as React from "react";

/**
 * Phase 6 Slice 9 (Part B) — a generic, reusable 300ms-debounce primitive,
 * extracting the pattern already duplicated informally in this codebase:
 * `StudentFilters`'s own `searchDraft`/`setTimeout` pair
 * (`features/students/components/student-filters.tsx`) and
 * `StudentSearchBox`'s identical `query`/`debouncedQuery` pair
 * (`features/payments/components/student-search-box.tsx`) — both left
 * UNTOUCHED by this pass (out of this dispatch's scope; this hook is only
 * for new call sites this pass adds: the Pending/Upcoming/Receipts search
 * boxes and `FeeCategoryChipPicker`'s new filter input).
 *
 * Returns `value` itself, delayed by `delayMs` (default 300, matching every
 * existing debounce in this app) — a caller keeps its own `useState` for the
 * immediately-responsive input value, and only reacts to (e.g. fires a query
 * off) the DEBOUNCED value this hook returns.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
