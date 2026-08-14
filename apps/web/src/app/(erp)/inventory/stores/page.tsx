"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { StoreResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useStores, useUpdateStore } from "@/features/inventory/hooks/use-stores";
import { CreateStoreDialog } from "@/features/inventory/components/create-store-dialog";
import { EditStoreDialog } from "@/features/inventory/components/edit-store-dialog";

const ALL_STATUSES_VALUE = "__all__";
type StatusFilter = "true" | "false" | typeof ALL_STATUSES_VALUE;

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — Stores: a
 * flat list, no hierarchy, `inventory:store:manage`-gated (a role missing it
 * hits `<QueryBoundary>`'s own permission-denied state). Same Card +
 * `<DataTable>`-inside-`<QueryBoundary>` shape every other flat-CRUD list in
 * this codebase establishes, plus a direct-click activate/deactivate toggle
 * per row — the same shape `cost-centers/page.tsx` already establishes for
 * the identical "no delete route, `isActive` toggle only" pattern, EXCEPT
 * here the toggle goes through the generic `updateStore({isActive})` PATCH
 * (no dedicated `.../activate`/`.../deactivate` routes exist for stores, see
 * `stores.api.ts`'s own doc comment) rather than a separate endpoint per
 * direction.
 */
export default function StoresPage() {
  const t = useTranslations("inventory.stores.list");
  const tCommon = useTranslations("common");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(ALL_STATUSES_VALUE);
  const [search, setSearch] = React.useState("");
  const storesQuery = useStores(statusFilter === ALL_STATUSES_VALUE ? undefined : statusFilter === "true");
  const updateMutation = useUpdateStore();

  const filterStores = React.useCallback(
    (stores: StoreResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return stores;
      return stores.filter((s) => s.name.toLowerCase().includes(term) || s.location.toLowerCase().includes(term));
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<StoreResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { accessorKey: "location", header: t("columns.location") },
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
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <EditStoreDialog store={row.original} />
            {row.original.isActive ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-tint-destructive hover:text-destructive"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: row.original.id, dto: { isActive: false } })}
              >
                {t("deactivate")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: row.original.id, dto: { isActive: true } })}
              >
                {t("activate")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, tCommon, updateMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateStoreDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("searchLabel")}</Label>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("statusFilterLabel")}</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>{t("allStatuses")}</SelectItem>
                  <SelectItem value="true">{tCommon("active")}</SelectItem>
                  <SelectItem value="false">{tCommon("inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={storesQuery} isEmpty={(d) => d.length === 0}>
            {(stores) => {
              const filtered = filterStores(stores);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noStoresMatchSearch")}</p>
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
