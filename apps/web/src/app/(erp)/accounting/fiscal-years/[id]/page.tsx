"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PeriodResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useFiscalYear } from "@/features/accounting/hooks/use-fiscal-years";
import { usePeriodsForFiscalYear } from "@/features/accounting/hooks/use-periods";
import { PeriodStatusActions } from "@/features/accounting/components/period-status-actions";

const FISCAL_YEAR_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-success",
  CLOSING: "soft-warning",
  LOCKED: "soft-secondary",
};

const PERIOD_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-success",
  SOFT_CLOSED: "soft-warning",
  HARD_CLOSED: "soft-destructive",
};

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — a fiscal
 * year's periods table: header `Card` (name/range/status, read-only — no
 * edit dialog exists, `FiscalYearsController` has no update route at all,
 * confirmed by reading it), then `GET /accounting/fiscal-years/{id}/periods`
 * (ascending by `seq`, server-guaranteed) as a `<DataTable>` with
 * `<PeriodStatusActions>` per row. Same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `app/(erp)/roles/[id]/page.tsx`
 * already established (read first as this page's own template).
 */
export default function FiscalYearDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("accounting.fiscalYears.detail");
  const tFiscalYearStatuses = useTranslations("accounting.fiscalYearStatuses");
  const tPeriodStatuses = useTranslations("accounting.periodStatuses");
  const fiscalYearQuery = useFiscalYear(id);
  const periodsQuery = usePeriodsForFiscalYear(id);

  const columns = React.useMemo<ColumnDef<PeriodResponseDto>[]>(
    () => [
      { accessorKey: "seq", header: t("columns.seq") },
      { accessorKey: "startsOn", header: t("columns.startsOn") },
      { accessorKey: "endsOn", header: t("columns.endsOn") },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={PERIOD_STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tPeriodStatuses(row.original.status)}</Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => <PeriodStatusActions period={row.original} fiscalYearId={id} />,
      },
    ],
    [t, tPeriodStatuses, id],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounting/fiscal-years">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={fiscalYearQuery}>
        {(fiscalYear) => (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base text-foreground">{fiscalYear.name}</CardTitle>
                <CardDescription>
                  {fiscalYear.startsOn} — {fiscalYear.endsOn}
                </CardDescription>
              </div>
              <Badge variant={FISCAL_YEAR_STATUS_BADGE_VARIANT[fiscalYear.status] ?? "outline"}>
                {tFiscalYearStatuses(fiscalYear.status)}
              </Badge>
            </CardHeader>
          </Card>
        )}
      </QueryBoundary>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("periodsTitle")}</CardTitle>
          <CardDescription>{t("periodsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={periodsQuery} isEmpty={(d) => d.length === 0}>
            {(periods) => <DataTable columns={columns} data={periods} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
