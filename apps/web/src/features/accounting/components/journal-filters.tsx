"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFiscalYears } from "../hooks/use-fiscal-years";
import { usePeriodsForFiscalYear } from "../hooks/use-periods";
import type { ListJournalsParams } from "../api/journals.api";

const ALL_SENTINEL = "__all__"; // `<Select>` (unlike `<Combobox>`) can't represent "nothing selected" as `value=""` — same NONE_SENTINEL pattern `create-account-dialog.tsx` established for its own optional `controlDomain` select.

export interface JournalFiltersState {
  sourceModule: string;
  fromDate: string;
  toDate: string;
  /** Client-side only — narrows the period `<Select>` to one fiscal year's periods; never sent to the server directly (`periodId` is). */
  fiscalYearId: string;
  periodId: string;
}

export const EMPTY_JOURNAL_FILTERS: JournalFiltersState = { sourceModule: "", fromDate: "", toDate: "", fiscalYearId: "", periodId: "" };

/** `GET /accounting/journals`'s real filter params — `fiscalYearId` (this component's own cascading-picker state) is deliberately dropped here, only `periodId` is a real server-side filter. */
export function journalFiltersToParams(filters: JournalFiltersState): ListJournalsParams {
  return {
    ...(filters.sourceModule.trim() ? { sourceModule: filters.sourceModule.trim() } : {}),
    ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
    ...(filters.toDate ? { toDate: filters.toDate } : {}),
    ...(filters.periodId ? { periodId: filters.periodId } : {}),
  };
}

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — the journals list page's
 * filter bar: source module (free text — `PostJournalDto.sourceModule` has
 * no fixed enum server-side, any domain module can post through
 * `PostingService.post()` directly), a date range, and a period picker.
 *
 * **Period picker is a cascading Fiscal Year -> Period pair**, not a flat
 * period `<Select>` — `GET /accounting/fiscal-years/{id}/periods` (Part 1's
 * own `usePeriodsForFiscalYear()`) is the only periods-listing endpoint that
 * exists (confirmed by reading `FiscalYearsController` directly: no
 * "list all periods across every year" route), so a fiscal year must be
 * picked first to know which periods to even offer.
 */
export function JournalFilters({ value, onChange }: { value: JournalFiltersState; onChange: (next: JournalFiltersState) => void }) {
  const t = useTranslations("accounting.journals.filters");
  const fiscalYearsQuery = useFiscalYears();
  const periodsQuery = usePeriodsForFiscalYear(value.fiscalYearId || undefined);

  function handleFiscalYearChange(next: string) {
    const fiscalYearId = next === ALL_SENTINEL ? "" : next;
    onChange({ ...value, fiscalYearId, periodId: "" });
  }

  function handlePeriodChange(next: string) {
    onChange({ ...value, periodId: next === ALL_SENTINEL ? "" : next });
  }

  const hasActiveFilters = !!(value.sourceModule || value.fromDate || value.toDate || value.periodId);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44 space-y-1.5">
        <Label>{t("sourceModuleLabel")}</Label>
        <Input
          value={value.sourceModule}
          maxLength={20}
          onChange={(e) => onChange({ ...value, sourceModule: e.target.value })}
          placeholder={t("sourceModulePlaceholder")}
        />
      </div>
      <div className="w-40 space-y-1.5">
        <Label>{t("fromDateLabel")}</Label>
        <Input type="date" value={value.fromDate} onChange={(e) => onChange({ ...value, fromDate: e.target.value })} />
      </div>
      <div className="w-40 space-y-1.5">
        <Label>{t("toDateLabel")}</Label>
        <Input type="date" value={value.toDate} onChange={(e) => onChange({ ...value, toDate: e.target.value })} />
      </div>
      <div className="w-48 space-y-1.5">
        <Label>{t("fiscalYearLabel")}</Label>
        <Select value={value.fiscalYearId || ALL_SENTINEL} onValueChange={handleFiscalYearChange}>
          <SelectTrigger>
            <SelectValue placeholder={t("allFiscalYears")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allFiscalYears")}</SelectItem>
            {(fiscalYearsQuery.data ?? []).map((fy) => (
              <SelectItem key={fy.id} value={fy.id}>
                {fy.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-40 space-y-1.5">
        <Label>{t("periodLabel")}</Label>
        <Select value={value.periodId || ALL_SENTINEL} onValueChange={handlePeriodChange} disabled={!value.fiscalYearId}>
          <SelectTrigger>
            <SelectValue placeholder={t("allPeriods")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allPeriods")}</SelectItem>
            {(periodsQuery.data ?? []).map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {t("periodOption", { seq: period.seq, startsOn: period.startsOn, endsOn: period.endsOn })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_JOURNAL_FILTERS)}>
          <X className="size-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
