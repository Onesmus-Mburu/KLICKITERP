"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ItemResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCategories } from "@/features/inventory/hooks/use-categories";
import { useItems, useItemSearch, type InvItemType } from "@/features/inventory/hooks/use-items";
import { CreateItemDialog } from "@/features/inventory/components/create-item-dialog";

const ALL_VALUE = "__all__";
const SEARCH_LIMIT = 20;
const ITEM_TYPES: InvItemType[] = ["STOCK", "CONSUMABLE", "SERVICE", "RESALE"];

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — Items: list +
 * debounced trigram search + category/type/active filters, the same
 * search-vs-list split `procurement/suppliers/page.tsx` establishes: `GET
 * .../items/search` (trigram, name-only) backs the search box; `GET
 * .../items?categoryId=&itemType=&isActive=` (the plain, optionally filtered
 * list) backs everything else. Only ONE of the two queries is ever
 * `enabled` at a time (`isSearching`), so `<QueryBoundary>` always renders
 * exactly one query's real state. `inventory:item:view`-gated (a role
 * missing it hits `<QueryBoundary>`'s own permission-denied state) — a
 * DIFFERENT permission from Categories/Stores above (this controller splits
 * view vs manage, see `items.api.ts`'s own doc comment).
 */
export default function ItemsPage() {
  const t = useTranslations("inventory.items.list");
  const tItemTypes = useTranslations("inventory.items.itemTypes");
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = React.useState(ALL_VALUE);
  const [typeFilter, setTypeFilter] = React.useState<InvItemType | typeof ALL_VALUE>(ALL_VALUE);
  const [activeFilter, setActiveFilter] = React.useState<"true" | "false" | typeof ALL_VALUE>(ALL_VALUE);
  const [searchDraft, setSearchDraft] = React.useState("");
  const searchQuery = useDebouncedValue(searchDraft, 300).trim();
  const isSearching = searchQuery.length > 0;

  const categoriesQuery = useCategories();
  const listQuery = useItems(
    {
      ...(categoryFilter !== ALL_VALUE ? { categoryId: categoryFilter } : {}),
      ...(typeFilter !== ALL_VALUE ? { itemType: typeFilter } : {}),
      ...(activeFilter !== ALL_VALUE ? { isActive: activeFilter === "true" } : {}),
    },
  );
  const searchResultsQuery = useItemSearch(searchQuery, SEARCH_LIMIT, { enabled: isSearching });
  const activeQuery = isSearching ? searchResultsQuery : listQuery;

  const categoryNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const columns = React.useMemo<ColumnDef<ItemResponseDto>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code") },
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "category",
        header: t("columns.category"),
        cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? "—",
      },
      {
        id: "itemType",
        header: t("columns.itemType"),
        cell: ({ row }) => <Badge variant="soft-secondary">{tItemTypes(row.original.itemType)}</Badge>,
      },
      { accessorKey: "uom", header: t("columns.uom") },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-secondary"}>
            {row.original.isActive ? t("active") : t("inactive")}
          </Badge>
        ),
      },
    ],
    [t, tItemTypes, categoryNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateItemDialog />
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
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("searchPlaceholder")} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("categoryFilterLabel")}</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={isSearching}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allCategories")}</SelectItem>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("typeFilterLabel")}</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as InvItemType | typeof ALL_VALUE)} disabled={isSearching}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allTypes")}</SelectItem>
                  {ITEM_TYPES.map((it) => (
                    <SelectItem key={it} value={it}>
                      {tItemTypes(it)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("statusFilterLabel")}</Label>
              <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as "true" | "false" | typeof ALL_VALUE)} disabled={isSearching}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStatuses")}</SelectItem>
                  <SelectItem value="true">{t("active")}</SelectItem>
                  <SelectItem value="false">{t("inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={activeQuery} isEmpty={(d) => d.length === 0}>
            {(items) =>
              items.length === 0 && isSearching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noItemsMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={items} onRowClick={(item) => router.push(`/inventory/items/${item.id}`)} />
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
