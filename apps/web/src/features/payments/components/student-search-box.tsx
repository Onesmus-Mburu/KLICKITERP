"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStudentSearch } from "@/features/students/hooks/use-students";

const SEARCH_DEBOUNCE_MS = 300;

export interface StudentSearchBoxProps {
  selectedStudent: StudentResponseDto | null;
  onSelect: (student: StudentResponseDto | null) => void;
}

/**
 * Reuses `useStudentSearch()` from `features/students/hooks/use-students.ts`
 * VERBATIM (per the plan's explicit instruction) — the exact trigram-search
 * endpoint (`GET /students/search`) this cashier flow is documented as being
 * built around. Student search is NOT reimplemented here.
 *
 * Deliberately a SIBLING implementation of `components/ui/combobox.tsx`'s
 * interaction mechanism (highlighted-index state, `ArrowDown`/`ArrowUp`
 * narrow/widen the highlight, `Enter` confirms the highlighted row) rather
 * than the `<Combobox>` component itself — a real, considered choice, not a
 * shortcut: `<Combobox>` is architecturally a fixed CLIENT-FILTERED list
 * (`items` prop, its own internal `query` state re-filters that same list by
 * substring) — this screen instead needs a SERVER-DRIVEN debounced async
 * search, and critically, F2's own spec ("focus + select-all the student
 * search input, FROM ANYWHERE on the capture screen") requires an
 * ALWAYS-MOUNTED, always-focusable `<input>` — `<Combobox>`'s search input
 * only exists in the DOM once its Radix `Popover.Content` is open (portal
 * -rendered), so it cannot itself be the F2 target. Building a small sibling
 * here that reuses the SAME keyboard-nav mechanism (not a different
 * interaction design) is the honest, pragmatic reading of "reuse the
 * mechanism, don't reinvent it."
 */
export const StudentSearchBox = React.forwardRef<HTMLInputElement, StudentSearchBoxProps>(function StudentSearchBox(
  { selectedStudent, onSelect },
  forwardedRef,
) {
  const t = useTranslations("payments.capture");
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const localRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLInputElement);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const searchQuery = useStudentSearch(debouncedQuery, 20);
  const results = React.useMemo(() => searchQuery.data ?? [], [searchQuery.data]);

  React.useEffect(() => setHighlighted(0), [results.length, debouncedQuery]);

  function handleSelect(student: StudentResponseDto) {
    onSelect(student);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setOpen(false);
    localRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClear();
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const student = results[highlighted];
      if (student) handleSelect(student);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={localRef}
          className="pl-9 pr-9"
          placeholder={t("studentSearchPlaceholder")}
          value={selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} — ${selectedStudent.admissionNo}` : query}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            if (selectedStudent) onSelect(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {selectedStudent && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            // `onMouseDown` (not `onClick`) fires before the input's own
            // `onBlur` closes the dropdown/loses selection context — the
            // standard trick for "click a result while a sibling input has
            // focus" races.
            onMouseDown={(e) => {
              e.preventDefault();
              handleClear();
            }}
            aria-label={t("clearStudent")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && !selectedStudent && debouncedQuery.trim().length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {searchQuery.isLoading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("searching")}</div>
          ) : results.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("noStudentsFound")}</div>
          ) : (
            results.map((student, index) => (
              <button
                key={student.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(student);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                  index === highlighted && "bg-muted",
                )}
              >
                <span className="font-medium text-foreground">
                  {student.firstName} {student.lastName}
                </span>
                <span className="text-xs text-muted-foreground">{student.admissionNo}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
