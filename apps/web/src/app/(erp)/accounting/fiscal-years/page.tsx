"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FiscalYearResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years";
import { CreateFiscalYearDialog } from "@/features/accounting/components/create-fiscal-year-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-success",
  CLOSING: "soft-warning",
  LOCKED: "soft-secondary",
};

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — Fiscal
 * Years list: `GET /accounting/fiscal-years` (`accounting:fiscal-year:view`)
 * as a plain `<DataTable>` (unpaginated — fiscal years are a small,
 * naturally-bounded, one-per-year list), a create-dialog trigger in the
 * header, row click navigates to `/accounting/fiscal-years/[id]` (this
 * year's periods table) — same `onRowClick` mechanism
 * `app/(erp)/roles/page.tsx` already established. No "close year" action
 * anywhere on this page — confirmed no such endpoint exists (see
 * `fiscal-years.api.ts`'s own doc comment); `status` is purely a read-only
 * reflection of server-computed state.
 */
export default function FiscalYearsPage() {
  const t = useTranslations("accounting.fiscalYears.list");
  const tStatuses = useTranslations("accounting.fiscalYearStatuses");
  const router = useRouter();
  const fiscalYearsQuery = useFiscalYears();

  const columns = React.useMemo<ColumnDef<FiscalYearResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { accessorKey: "startsOn", header: t("columns.startsOn") },
      { accessorKey: "endsOn", header: t("columns.endsOn") },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tStatuses],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateFiscalYearDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={fiscalYearsQuery} isEmpty={(d) => d.length === 0}>
            {(fiscalYears) => (
              <DataTable columns={columns} data={fiscalYears} onRowClick={(row) => router.push(`/accounting/fiscal-years/${row.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
