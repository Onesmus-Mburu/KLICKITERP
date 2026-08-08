"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useNumberingSeriesList } from "@/features/settings/hooks/use-numbering-series";
import { PreviewNumberingSeriesDialog } from "@/features/settings/components/preview-numbering-series-dialog";
import type { NumberingSeriesResponse } from "@/features/settings/types";

/**
 * `settings:numbering-series:view` — genuinely READ-ONLY by backend design
 * (`NumberingController`'s own doc comment: allocation is an internal
 * service call, never a public HTTP mutation — there is no create/edit
 * endpoint to build against, and `settings:numbering-series:manage` does
 * not exist as a permission code anywhere in the catalogue, confirmed by
 * reading it directly). List + a per-row "Preview next N" dialog is the
 * entire real surface this screen can offer.
 */
export default function NumberingSeriesPage() {
  const t = useTranslations("settings.numberingSeries");
  const seriesQuery = useNumberingSeriesList();

  const columns = React.useMemo<ColumnDef<NumberingSeriesResponse>[]>(
    () => [
      { accessorKey: "docType", header: t("docType") },
      { accessorKey: "seriesCode", header: t("seriesCode") },
      { accessorKey: "prefix", header: t("prefix") },
      { accessorKey: "padWidth", header: t("padWidth") },
      { accessorKey: "resetPolicy", header: t("resetPolicy") },
      { accessorKey: "periodKey", header: t("periodKey") },
      { accessorKey: "nextNo", header: t("nextNo") },
      { id: "actions", header: t("actionsHeader"), cell: ({ row }) => <PreviewNumberingSeriesDialog series={row.original} /> },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={seriesQuery} isEmpty={(d) => d.length === 0}>
            {(series) => <DataTable columns={columns} data={series} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
