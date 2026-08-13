"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CostCenterResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useActivateCostCenter, useCostCenters, useDeactivateCostCenter } from "@/features/accounting/hooks/use-cost-centers";
import { CreateCostCenterDialog } from "@/features/accounting/components/create-cost-center-dialog";
import { EditCostCenterDialog } from "@/features/accounting/components/edit-cost-center-dialog";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — Cost
 * Centers: a flat list, no hierarchy, built exactly like
 * `features/departments`/`app/(erp)/departments/page.tsx` (its own doc
 * comment's structural template: Card + `<DataTable>` inside `<QueryBoundary
 * isEmpty>`, a create-dialog trigger in the header, a per-row edit dialog,
 * a plain client-side substring search over an already-fully-loaded small
 * dataset), PLUS a direct-click deactivate/activate toggle per row — the
 * same shape `app/(erp)/billing/fee-categories/page.tsx` already establishes
 * for the identical "activate/deactivate, no delete route exists" shape
 * (confirmed: `CostCentersController` has no delete route either).
 */
export default function CostCentersPage() {
  const t = useTranslations("accounting.costCenters.list");
  const tCommon = useTranslations("common");
  const costCentersQuery = useCostCenters();
  const deactivateMutation = useDeactivateCostCenter();
  const activateMutation = useActivateCostCenter();
  const [search, setSearch] = React.useState("");

  const filterCostCenters = React.useCallback(
    (costCenters: CostCenterResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return costCenters;
      return costCenters.filter((c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term));
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<CostCenterResponseDto>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code") },
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-secondary"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EditCostCenterDialog costCenter={row.original} />
            {row.original.isActive ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-tint-destructive hover:text-destructive"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(row.original.id)}
              >
                {t("deactivate")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate(row.original.id)}
              >
                {t("activate")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, tCommon, deactivateMutation, activateMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateCostCenterDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <QueryBoundary query={costCentersQuery} isEmpty={(d) => d.length === 0}>
            {(costCenters) => {
              const filtered = filterCostCenters(costCenters);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noCostCentersMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
