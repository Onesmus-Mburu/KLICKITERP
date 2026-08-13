"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useFiscalYear } from "@/features/accounting/hooks/use-fiscal-years";
import { useBudget } from "@/features/accounting/hooks/use-budgets";
import { BudgetLineEditor } from "@/features/accounting/components/budget-line-editor";
import { BudgetStatusActions } from "@/features/accounting/components/budget-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  ACTIVE: "soft-success",
  SUPERSEDED: "outline",
};

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — a budget's detail view:
 * header `Card` (name, version label, fiscal year, status badge,
 * `<BudgetStatusActions>`) + a lines `Card` (`<BudgetLineEditor>`, which
 * itself renders the add/edit/delete controls gated to DRAFT and the "total
 * annual amount" summary — see that component's own doc comment). Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * `fiscal-years/[id]/page.tsx`/`journals/[id]/page.tsx` already established.
 *
 * The fiscal year's own NAME (not just its id) is resolved via
 * `useFiscalYear()` (Part 1's own hook) for the header card — `BudgetResponseDto`
 * only carries `fiscalYearId`, no denormalized name field.
 */
export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("accounting.budgets.detail");
  const tStatuses = useTranslations("accounting.budgetStatuses");
  const budgetQuery = useBudget(id);
  const fiscalYearQuery = useFiscalYear(budgetQuery.data?.fiscalYearId);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounting/budgets">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={budgetQuery}>
        {(budget) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{budget.name}</CardTitle>
                  <CardDescription>
                    {t("versionLabelLabel")}: {budget.versionLabel} · {t("fiscalYearLabel")}: {fiscalYearQuery.data?.name ?? budget.fiscalYearId}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_BADGE_VARIANT[budget.status] ?? "outline"}>{tStatuses(budget.status)}</Badge>
                  <BudgetStatusActions budget={budget} />
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetLineEditor budget={budget} />
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
