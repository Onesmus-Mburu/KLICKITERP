"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { StockTakeResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useStores } from "@/features/inventory/hooks/use-stores";
import { useStockTakes } from "@/features/inventory/hooks/use-stock-takes";
import { CreateStockTakeDialog } from "@/features/inventory/components/create-stock-take-dialog";

const ALL_VALUE = "__all__";
const STOCK_TAKE_STATUSES = ["OPEN", "COUNTING", "REVIEW", "PENDING_APPROVAL", "POSTED", "CANCELLED"] as const;

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-secondary",
  COUNTING: "soft-primary",
  REVIEW: "soft-accent",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) — the
 * stock-takes list: status/store filters (both optional, feeding
 * `StockTakesController_list`'s own conditional-query-object fix, see
 * `stock-takes.api.ts`'s own doc comment) + `<CreateStockTakeDialog>`.
 * `inventory:stock-take:create`-gated (reused across every GET on this
 * controller, confirmed by reading `StockTakesController` directly).
 */
export default function StockTakesPage() {
  const t = useTranslations("inventory.stockTakes.list");
  const tStatuses = useTranslations("inventory.stockTakes.statuses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState(ALL_VALUE);
  const [storeFilter, setStoreFilter] = React.useState(ALL_VALUE);

  const storesQuery = useStores();
  const stockTakesQuery = useStockTakes({
    ...(statusFilter !== ALL_VALUE ? { status: statusFilter } : {}),
    ...(storeFilter !== ALL_VALUE ? { storeId: storeFilter } : {}),
  });

  const storeNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const store of storesQuery.data ?? []) map.set(store.id, store.name);
    return map;
  }, [storesQuery.data]);

  const columns = React.useMemo<ColumnDef<StockTakeResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      { id: "store", header: t("columns.store"), cell: ({ row }) => storeNameById.get(row.original.storeId) ?? row.original.storeId },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/inventory/stock-takes/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, storeNameById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateStockTakeDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("statusFilterLabel")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStatuses")}</SelectItem>
                  {STOCK_TAKE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {tStatuses(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("storeFilterLabel")}</Label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStores")}</SelectItem>
                  {(storesQuery.data ?? []).map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={stockTakesQuery} isEmpty={(d) => d.length === 0}>
            {(stockTakes) => <DataTable columns={columns} data={stockTakes} onRowClick={(stockTake) => router.push(`/inventory/stock-takes/${stockTake.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
