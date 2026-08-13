"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { BudgetResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years";
import { useBudgets } from "@/features/accounting/hooks/use-budgets";
import { CreateBudgetDialog } from "@/features/accounting/components/create-budget-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  ACTIVE: "soft-success",
  SUPERSEDED: "outline",
};

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — the budgets list: fiscal-year
 * scoped, per `BudgetsController.list()`'s own real signature
 * (`@Query("fiscalYearId") fiscalYearId: string`, required, not optional —
 * confirmed by reading the controller directly), unlike every OTHER list
 * page in this feature folder (accounts/fiscal-years/cost-centers/journals),
 * none of which require a parent selection just to load. A fiscal year
 * picker (`useFiscalYears()`, Part 1's own hook) is therefore this page's
 * own first-class control, not an optional filter — the table area itself
 * shows a prompt instead of an empty table until one is picked, and
 * `<CreateBudgetDialog>`'s trigger is only rendered once one is (it needs a
 * real `fiscalYearId` to construct `CreateBudgetDto`).
 *
 * No URL/query-string sync for the selected fiscal year — plain local
 * component state, matching `journal-filters.tsx`'s own filter-bar
 * precedent (nothing in this feature folder persists filter state across a
 * navigation/reload today).
 */
export default function BudgetsPage() {
  const t = useTranslations("accounting.budgets.list");
  const tStatuses = useTranslations("accounting.budgetStatuses");
  const router = useRouter();
  const [fiscalYearId, setFiscalYearId] = React.useState("");
  const fiscalYearsQuery = useFiscalYears();
  const budgetsQuery = useBudgets(fiscalYearId || undefined);

  const columns = React.useMemo<ColumnDef<BudgetResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { accessorKey: "versionLabel", header: t("columns.versionLabel") },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tStatuses],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        {fiscalYearId && <CreateBudgetDialog fiscalYearId={fiscalYearId} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-64 space-y-1.5">
            <Label>{t("fiscalYearLabel")}</Label>
            <Select value={fiscalYearId} onValueChange={setFiscalYearId} disabled={fiscalYearsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectFiscalYearPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(fiscalYearsQuery.data ?? []).map((fy) => (
                  <SelectItem key={fy.id} value={fy.id}>
                    {fy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fiscalYearId ? (
            <QueryBoundary query={budgetsQuery} isEmpty={(d) => d.length === 0}>
              {(budgets) => <DataTable columns={columns} data={budgets} onRowClick={(row) => router.push(`/accounting/budgets/${row.id}`)} />}
            </QueryBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{t("selectFiscalYearPrompt")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
