"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { findCurrent, useAcademicYears, useTerms } from "../hooks/use-academic-calendar";

export interface AcademicYearTermSelectProps {
  academicYearId: string | null;
  termId: string | null;
  onAcademicYearChange: (academicYearId: string | null) => void;
  onTermChange: (termId: string | null) => void;
  yearPlaceholder?: string;
  termPlaceholder?: string;
  /** Once both lists have loaded, auto-selects `isCurrent` for whichever of year/term is still unset — every real picker this plan asks for ("default-select the current year/term in pickers") wants this; a caller that genuinely wants a blank starting state (none currently) can omit it. */
  autoSelectCurrent?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Phase 6 Slice 3 — academic-year -> term cascading select, the same
 * value/onChange-props-not-coupled-to-a-form-library shape
 * `class-stream-select.tsx` (Phase 6 Slice 2) established for the analogous
 * class -> stream cascade. Clears the term via a real `useEffect` (not an
 * inline `onAcademicYearChange` side effect) whenever the year actually
 * changes — mirrors that component's own "clear the dependent selection on
 * parent change" invariant.
 */
export function AcademicYearTermSelect({
  academicYearId,
  termId,
  onAcademicYearChange,
  onTermChange,
  yearPlaceholder,
  termPlaceholder,
  autoSelectCurrent,
  disabled,
  className,
}: AcademicYearTermSelectProps) {
  const yearsQuery = useAcademicYears();
  const termsQuery = useTerms(academicYearId ?? undefined);

  const previousYearId = React.useRef(academicYearId);
  React.useEffect(() => {
    if (previousYearId.current !== academicYearId) {
      previousYearId.current = academicYearId;
      onTermChange(null);
    }
  }, [academicYearId, onTermChange]);

  React.useEffect(() => {
    if (!autoSelectCurrent || academicYearId || !yearsQuery.data) return;
    const current = findCurrent(yearsQuery.data);
    if (current) onAcademicYearChange(current.id);
    // Only re-run when the years list identity changes or the caller clears
    // academicYearId back to null — not on every onAcademicYearChange
    // identity change (callers commonly pass an inline arrow fn).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectCurrent, academicYearId, yearsQuery.data]);

  React.useEffect(() => {
    if (!autoSelectCurrent || termId || !termsQuery.data) return;
    const current = findCurrent(termsQuery.data);
    if (current) onTermChange(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectCurrent, termId, termsQuery.data]);

  return (
    <div className={className ?? "flex flex-col gap-3 sm:flex-row"}>
      <Select value={academicYearId ?? ""} onValueChange={onAcademicYearChange} disabled={disabled || yearsQuery.isLoading}>
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder={yearPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {yearsQuery.data?.map((year) => (
            <SelectItem key={year.id} value={year.id}>
              {year.name}
              {year.isCurrent ? " *" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={termId ?? ""} onValueChange={onTermChange} disabled={disabled || !academicYearId || termsQuery.isLoading}>
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder={termPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {termsQuery.data?.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.name}
              {term.isCurrent ? " *" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
