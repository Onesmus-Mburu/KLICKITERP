"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { AcademicYearWizardDialog } from "@/features/billing/components/academic-year-wizard-dialog";
import {
  SETTINGS_ACADEMIC_YEARS_QUERY_KEY,
  SETTINGS_TERMS_QUERY_KEY,
  useAcademicYears,
  useTerms,
  findCurrent,
} from "@/features/settings/hooks/use-academic-calendar";
import { EditAcademicYearDialog } from "@/features/settings/components/edit-academic-year-dialog";
import { EditTermDialog } from "@/features/settings/components/edit-term-dialog";
import { SetCurrentYearButton } from "@/features/settings/components/set-current-year-button";
import { SetCurrentTermButton } from "@/features/settings/components/set-current-term-button";
import { TermBillingLockToggle } from "@/features/settings/components/term-billing-lock-toggle";
import type { AcademicYearResponse, TermResponse } from "@/features/settings/types";

/**
 * `settings:academic-year:view`/`:manage` + `settings:term:view`/`:manage` —
 * Phase 6 Slice 11 Part 1's first real Settings-area screen beyond
 * Integrations (Slice 7). List/detail layout, per the plan's own explicit
 * "your call on the cleanest real layout" guidance: a full, unbounded
 * Academic Years table (small real dataset, no `serverPagination` — same
 * choice `<IntegrationsSettingsPage>` already made for an analogous small
 * list) up top, with a year-`<Select>`-driven Terms sub-table below it
 * (rather than expandable table rows — `<DataTable>` has no row-expansion
 * support to build against, and this mirrors `fee-structures/page.tsx`'s
 * own already-established year-select-drives-a-scoped-table shape).
 *
 * "Create year & terms" reuses `<AcademicYearWizardDialog>`
 * (`features/billing/components/academic-year-wizard-dialog.tsx`) VERBATIM,
 * per the plan's explicit instruction — not rebuilt, not modified, just
 * mounted here the same controlled-`open`/`onOpenChange` way
 * `fee-structures/page.tsx` already does. Edit/set-current/billing-lock are
 * all genuinely new capabilities (Part 1's own scope) with no existing
 * frontend precedent anywhere before this pass.
 */
export default function AcademicCalendarPage() {
  const t = useTranslations("settings.academicCalendar");
  const queryClient = useQueryClient();
  const yearsQuery = useAcademicYears();

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [selectedYearId, setSelectedYearId] = React.useState<string | null>(null);
  // Client-side filter over the already-fully-fetched years list (no
  // `serverPagination`/backend `q` param — `useAcademicYears()` itself has
  // no page/pageSize concept, same "small unbounded list" shape this page's
  // own doc comment already establishes) — mirrors the exact instant
  // `.filter()` pattern `student-selection-grid.tsx` (Phase 6 Slice 9 Part
  // B) already established for an analogous already-loaded small list.
  // `name` IS the year's own label (e.g. "2026", "AY 2026/27") — there is no
  // separate numeric "year" field to search independently, so filtering by
  // `name` covers "search by name or year" in one field.
  const [yearSearch, setYearSearch] = React.useState("");

  /**
   * `<AcademicYearWizardDialog>` is reused verbatim (per the plan) — it
   * calls `features/billing/hooks/use-academic-calendar.ts`'s
   * `useCreateAcademicYear()`/`useCreateTerm()`, which invalidate BILLING's
   * own query keys (`["billing","academic-years"]`/`["billing","terms",...]`),
   * not this settings-scoped feature's keys. Both hook sets share the SAME
   * app-wide `QueryClient`, so a plain invalidate here on dialog close is
   * enough to make this screen reflect whatever the wizard actually did —
   * cheap and always safe (idempotent) even on a plain cancel with no real
   * change underneath.
   */
  function handleWizardOpenChange(next: boolean) {
    setWizardOpen(next);
    if (!next) {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_ACADEMIC_YEARS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SETTINGS_TERMS_QUERY_KEY });
    }
  }

  React.useEffect(() => {
    if (!selectedYearId && yearsQuery.data && yearsQuery.data.length > 0) {
      const current = findCurrent(yearsQuery.data);
      setSelectedYearId(current?.id ?? yearsQuery.data[0].id);
    }
  }, [selectedYearId, yearsQuery.data]);

  const termsQuery = useTerms(selectedYearId ?? undefined);

  const filteredYears = React.useMemo(() => {
    const query = yearSearch.trim().toLowerCase();
    if (!query || !yearsQuery.data) return yearsQuery.data;
    return yearsQuery.data.filter((year) => year.name.toLowerCase().includes(query));
  }, [yearsQuery.data, yearSearch]);

  const yearColumns = React.useMemo<ColumnDef<AcademicYearResponse>[]>(
    () => [
      { accessorKey: "name", header: t("yearName") },
      { accessorKey: "startsOn", header: t("startsOn") },
      { accessorKey: "endsOn", header: t("endsOn") },
      { id: "current", header: t("current"), cell: ({ row }) => <SetCurrentYearButton year={row.original} /> },
      { id: "actions", header: t("actionsHeader"), cell: ({ row }) => <EditAcademicYearDialog year={row.original} /> },
    ],
    [t],
  );

  const termColumns = React.useMemo<ColumnDef<TermResponse>[]>(
    () => [
      { accessorKey: "name", header: t("termNameLabel") },
      { accessorKey: "seq", header: t("seq") },
      { accessorKey: "startsOn", header: t("startsOn") },
      { accessorKey: "endsOn", header: t("endsOn") },
      { id: "current", header: t("current"), cell: ({ row }) => <SetCurrentTermButton term={row.original} /> },
      { id: "billingLock", header: t("billingLockHeader"), cell: ({ row }) => <TermBillingLockToggle term={row.original} /> },
      { id: "actions", header: t("actionsHeader"), cell: ({ row }) => <EditTermDialog term={row.original} /> },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button type="button" onClick={() => setWizardOpen(true)}>
          <CalendarPlus className="size-4" />
          {t("createYearTrigger")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("yearsListTitle")}</CardTitle>
          <CardDescription>{t("yearsListDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={yearSearch}
              onChange={(e) => setYearSearch(e.target.value)}
              placeholder={t("searchYearsPlaceholder")}
            />
          </div>
          <QueryBoundary query={yearsQuery} isEmpty={(d) => d.length === 0}>
            {() =>
              filteredYears && filteredYears.length > 0 ? (
                <DataTable columns={yearColumns} data={filteredYears} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noYearsMatchSearch")}</p>
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("termsListTitle")}</CardTitle>
          <CardDescription>{t("termsListDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("filterByYear")}</Label>
            <Select value={selectedYearId ?? ""} onValueChange={setSelectedYearId} disabled={yearsQuery.isPending}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectYearPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {yearsQuery.data?.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? ` (${t("current")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedYearId ? (
            <QueryBoundary query={termsQuery} isEmpty={(d) => d.length === 0}>
              {(terms) => <DataTable columns={termColumns} data={terms} />}
            </QueryBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noYearsHint")}</p>
          )}
        </CardContent>
      </Card>

      <AcademicYearWizardDialog open={wizardOpen} onOpenChange={handleWizardOpenChange} />
    </div>
  );
}
