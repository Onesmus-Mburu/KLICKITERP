"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SupplierResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useSuppliers, useSupplierSearch, type SupplierStatus } from "@/features/procurement/hooks/use-suppliers";
import { SupplierSearchBar } from "@/features/procurement/components/supplier-search-bar";
import { CreateSupplierDialog } from "@/features/procurement/components/create-supplier-dialog";

const ALL_STATUSES_VALUE = "__all__";
const SEARCH_LIMIT = 20;

const SUPPLIER_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  BLACKLISTED: "soft-destructive",
  INACTIVE: "soft-secondary",
};

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — the Suppliers list:
 * Card + `<SupplierSearchBar>` (debounced trigram search) + a status
 * `<Select>` filter + `<DataTable>` inside `<QueryBoundary>`, row click
 * navigates to `/procurement/suppliers/[id]` (the same `onRowClick`
 * mechanism `app/(erp)/roles/page.tsx` established). `procurement:supplier:view`-
 * gated server-side; a role missing it hits `<QueryBoundary>`'s own
 * permission-denied state, not a page-level special case.
 *
 * **Search vs. list — two genuinely different endpoints, not one filtered
 * client-side**: `GET .../search` (trigram, name-only) backs the search box;
 * `GET .../suppliers?status=` (the plain list, optionally status-filtered)
 * backs everything else. Only ONE of the two queries is ever `enabled` at a
 * time (`isSearching`), so `<QueryBoundary>` always renders exactly one
 * query's real state — never a stale mix of both. The status filter still
 * applies while a search is empty; once typing starts, the search box takes
 * over and the status `<Select>` is disabled (searching across ALL statuses
 * — `SuppliersController.search()` takes no `status` param at all, confirmed
 * by reading it directly, so narrowing search results by status isn't
 * something the API can even do).
 */
export default function SuppliersPage() {
  const t = useTranslations("procurement.suppliers.list");
  const tStatuses = useTranslations("procurement.suppliers.statuses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<SupplierStatus | typeof ALL_STATUSES_VALUE>(ALL_STATUSES_VALUE);
  const [searchQuery, setSearchQuery] = React.useState("");
  const isSearching = searchQuery.length > 0;

  const listQuery = useSuppliers(statusFilter === ALL_STATUSES_VALUE ? undefined : statusFilter, { enabled: !isSearching });
  const searchResultsQuery = useSupplierSearch(searchQuery, SEARCH_LIMIT, { enabled: isSearching });
  const activeQuery = isSearching ? searchResultsQuery : listQuery;

  const columns = React.useMemo<ColumnDef<SupplierResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "tradingName", header: t("columns.tradingName"), cell: ({ row }) => row.original.tradingName ?? "—" },
      { id: "kraPin", header: t("columns.kraPin"), cell: ({ row }) => row.original.kraPin ?? "—" },
      {
        id: "categories",
        header: t("columns.categories"),
        cell: ({ row }) =>
          row.original.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.categories.slice(0, 3).map((c) => (
                <Badge key={c} variant="soft-secondary">
                  {c}
                </Badge>
              ))}
              {row.original.categories.length > 3 && (
                <Badge variant="outline">{t("moreCategories", { count: row.original.categories.length - 3 })}</Badge>
              )}
            </div>
          ) : (
            "—"
          ),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={SUPPLIER_STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>
        ),
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
              router.push(`/procurement/suppliers/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateSupplierDialog />
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
              <SupplierSearchBar onDebouncedQueryChange={setSearchQuery} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("statusFilterLabel")}</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as SupplierStatus | typeof ALL_STATUSES_VALUE)}
                disabled={isSearching}
              >
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>{t("allStatuses")}</SelectItem>
                  <SelectItem value="ACTIVE">{tStatuses("ACTIVE")}</SelectItem>
                  <SelectItem value="BLACKLISTED">{tStatuses("BLACKLISTED")}</SelectItem>
                  <SelectItem value="INACTIVE">{tStatuses("INACTIVE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={activeQuery} isEmpty={(d) => d.length === 0}>
            {(suppliers) =>
              suppliers.length === 0 && isSearching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noSuppliersMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={suppliers} onRowClick={(supplier) => router.push(`/procurement/suppliers/${supplier.id}`)} />
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
