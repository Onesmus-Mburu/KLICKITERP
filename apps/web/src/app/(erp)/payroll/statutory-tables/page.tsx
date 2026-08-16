"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { PyrlStatutoryTableResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { CreateStatutoryTableDialog } from "@/features/payroll/components/create-statutory-table-dialog";
import { EffectiveTableLookup } from "@/features/payroll/components/effective-table-lookup";
import { useStatutoryTables } from "@/features/payroll/hooks/use-statutory-tables";
import { PYRL_STATUTORY_KINDS, type PyrlStatutoryKind } from "@/features/payroll/lib/statutory-params";

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — the Statutory Tables list:
 * `GET /payroll/statutory-tables?kind=` requires `kind` (confirmed by
 * reading `StatutoryTablesController.listByKind()` directly, no "list every
 * kind" call exists) — a 4-way kind tab/toggle group (PAYE/NSSF/SHIF/AHL)
 * drives which list is shown, most-recent-`effectiveFrom`-first (the real
 * `listByKind()` ordering), rather than the plain no-filter list Part 2's
 * Salary Structures page shows. `<EffectiveTableLookup>` sits above the list
 * — BR-PYRL-01's own "what applies on this date" sanity-check panel, per
 * this part's own task brief: this is genuinely how an admin verifies their
 * own data before trusting a future payroll run to resolve correctly.
 * `payroll:statutory-table:manage`-gated server-side — the SAME shared
 * permission gates every route on this controller, including both
 * LIST-shaped ones (confirmed by reading it directly).
 */
export default function StatutoryTablesPage() {
  const t = useTranslations("payroll.statutoryTables.list");
  const tKinds = useTranslations("payroll.statutoryTables.kinds");
  const router = useRouter();
  const [kind, setKind] = React.useState<PyrlStatutoryKind>("PAYE");

  const tablesQuery = useStatutoryTables(kind);

  const columns = React.useMemo<ColumnDef<PyrlStatutoryTableResponseDto>[]>(
    () => [
      { accessorKey: "effectiveFrom", header: t("columns.effectiveFrom") },
      {
        id: "sourceNote",
        header: t("columns.sourceNote"),
        cell: ({ row }) => <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">{row.original.sourceNote}</span>,
      },
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
        <CreateStatutoryTableDialog defaultKind={kind} />
      </div>

      <EffectiveTableLookup />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("kindTabsLabel")}>
            {PYRL_STATUTORY_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                variant={k === kind ? "default" : "outline"}
                size="sm"
                role="tab"
                aria-selected={k === kind}
                onClick={() => setKind(k)}
              >
                {tKinds(k)}
              </Button>
            ))}
          </div>

          <QueryBoundary query={tablesQuery} isEmpty={(d) => d.length === 0}>
            {(tables) => <DataTable columns={columns} data={tables} onRowClick={(table) => router.push(`/payroll/statutory-tables/${table.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
