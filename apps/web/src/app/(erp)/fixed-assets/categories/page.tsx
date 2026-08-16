"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FaCategoryResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useCategories } from "@/features/fixed-assets/hooks/use-categories";
import { CreateCategoryDialog } from "@/features/fixed-assets/components/create-category-dialog";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — the
 * Categories list: a plain `<DataTable>` inside `<QueryBoundary>`, genuinely
 * NO filter UI — `CategoriesController.list()` takes zero query params,
 * confirmed by reading the controller directly, the same "no filter bar
 * when the endpoint has no filter params" precedent
 * `payroll/salary-structures/page.tsx` already establishes. Row click
 * navigates to `/fixed-assets/categories/[id]`.
 *
 * `fixed-assets:category:manage`-gated for EVERY route on this controller,
 * including this list — no separate `:view` permission exists at all
 * (confirmed by reading `CategoriesController` directly), so a role missing
 * it can't even see this list; `<QueryBoundary>`'s own permission-denied
 * state handles that here, same "the 403 IS the enforcement" discipline
 * every other page in this codebase follows.
 *
 * **2 real seeded rows always present** ("Furniture & Fittings", "IT
 * Equipment" — `FA_CATEGORY_SEED`, migration `0900`) — not placeholder data,
 * a real starting configuration this list will always show at minimum.
 */
export default function FixedAssetCategoriesPage() {
  const t = useTranslations("fixedAssets.categories.list");
  const tMethods = useTranslations("fixedAssets.categoryMethods");
  const router = useRouter();
  const categoriesQuery = useCategories();

  const columns = React.useMemo<ColumnDef<FaCategoryResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "method", header: t("columns.method"), cell: ({ row }) => <Badge variant="soft-secondary">{tMethods(row.original.method)}</Badge> },
      { id: "lifeMonths", header: t("columns.lifeMonths"), cell: ({ row }) => t("monthsValue", { count: row.original.lifeMonths }) },
      { id: "rate", header: t("columns.rate"), cell: ({ row }) => row.original.rate ?? "—" },
      { id: "residualPct", header: t("columns.residualPct"), cell: ({ row }) => row.original.residualPct },
    ],
    [t, tMethods],
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
          <QueryBoundary query={categoriesQuery} isEmpty={(d) => d.length === 0}>
            {(categories) => (
              <DataTable columns={columns} data={categories} onRowClick={(category) => router.push(`/fixed-assets/categories/${category.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
