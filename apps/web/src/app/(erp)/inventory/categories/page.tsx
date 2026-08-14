"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { domains_inventory_category_schema } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useCategories } from "@/features/inventory/hooks/use-categories";
import { CreateCategoryDialog } from "@/features/inventory/components/create-category-dialog";
import { EditCategoryDialog } from "@/features/inventory/components/edit-category-dialog";

type CategoryResponseDto = domains_inventory_category_schema.CategoryResponseDto;

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — Categories: a
 * flat list (no recursive tree view, per this part's own explicit scope),
 * built the same shape `app/(erp)/accounting/cost-centers/page.tsx`
 * establishes: Card + `<DataTable>` inside `<QueryBoundary isEmpty>`, a
 * create-dialog trigger in the header, a per-row edit dialog, a plain
 * client-side substring search over an already-fully-loaded small dataset.
 * `useCategories()` (no `parentId` arg) fetches EVERY category regardless of
 * depth — `inventory:category:manage` gates this whole screen (a role
 * missing it hits `<QueryBoundary>`'s own permission-denied state).
 *
 * The parent column resolves each row's `parentId` to that parent's own
 * `name` via a client-side id->name map built from the SAME already-fetched
 * flat list — no extra request, and no recursive traversal needed since only
 * ONE level up is shown (matches the "flat, not deeply nested" scope).
 */
export default function CategoriesPage() {
  const t = useTranslations("inventory.categories.list");
  const categoriesQuery = useCategories();
  const [search, setSearch] = React.useState("");

  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const filterCategories = React.useCallback(
    (categories: CategoryResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return categories;
      return categories.filter((c) => c.name.toLowerCase().includes(term));
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<CategoryResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "parent",
        header: t("columns.parent"),
        cell: ({ row }) => (row.original.parentId ? (nameById.get(row.original.parentId) ?? "—") : t("noParent")),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <EditCategoryDialog category={row.original} />
          </div>
        ),
      },
    ],
    [t, nameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateCategoryDialog />
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
          <QueryBoundary query={categoriesQuery} isEmpty={(d) => d.length === 0}>
            {(categories) => {
              const filtered = filterCategories(categories);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noCategoriesMatchSearch")}</p>
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
