"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CategoryResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCategories } from "@/features/expenses/hooks/use-categories";
import { CreateCategoryDialog } from "@/features/expenses/components/create-category-dialog";
import { EditCategoryDialog } from "@/features/expenses/components/edit-category-dialog";

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — Categories: a
 * flat list (no recursive tree view, per this part's own explicit scope,
 * matching Inventory's own `categories/page.tsx`, Slice 19 Part 1), built the
 * same shape: Card + `<DataTable>` inside `<QueryBoundary isEmpty>`, a
 * create-dialog trigger in the header, a per-row edit dialog, a plain
 * client-side substring search over an already-fully-loaded small dataset.
 * `useCategories()` (no `parentId` arg) fetches EVERY category regardless of
 * depth — `expenses:category:manage` gates this whole screen (a role missing
 * it hits `<QueryBoundary>`'s own permission-denied state).
 *
 * Two extra columns beyond Inventory's own shape, reflecting this domain's
 * genuinely richer `CategoryResponseDto`: the linked GL expense account
 * (resolved client-side from an already-fetched flat `useAccounts()` list —
 * no extra request, no `class`/`isActive` filter here since a category may
 * reference an account that's since been deactivated and this column should
 * still resolve it honestly) and a Budget Required badge.
 */
export default function ExpenseCategoriesPage() {
  const t = useTranslations("expenses.categories.list");
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const [search, setSearch] = React.useState("");

  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const accountLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accountsQuery.data ?? []) map.set(a.id, `${a.code} — ${a.name}`);
    return map;
  }, [accountsQuery.data]);

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
        id: "glExpenseAccount",
        header: t("columns.glExpenseAccount"),
        cell: ({ row }) => accountLabelById.get(row.original.glExpenseAccountId) ?? row.original.glExpenseAccountId,
      },
      {
        id: "budgetRequired",
        header: t("columns.budgetRequired"),
        cell: ({ row }) =>
          row.original.budgetRequired ? (
            <Badge variant="soft-warning">{t("budgetRequiredYes")}</Badge>
          ) : (
            <Badge variant="soft-secondary">{t("budgetRequiredNo")}</Badge>
          ),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) =>
          row.original.isActive ? <Badge variant="soft-success">{t("active")}</Badge> : <Badge variant="soft-secondary">{t("inactive")}</Badge>,
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
    [t, nameById, accountLabelById],
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
