"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { FaCategoryResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccount as useGlAccount } from "@/features/accounting/hooks/use-accounts";
import { useCategory } from "@/features/fixed-assets/hooks/use-categories";
import { EditCategoryDialog } from "@/features/fixed-assets/components/edit-category-dialog";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — a
 * category's detail page: header `Card` (name, method badge,
 * `<EditCategoryDialog>`) and a details grid (life months, RB rate,
 * residual %, the 3 GL account mappings each resolved to a human `code —
 * name` label) — same `useParams<{id:string}>()` + `<QueryBoundary>`
 * header-card shape `app/(erp)/banking/accounts/[id]/page.tsx` already
 * establishes. No audit metadata (`createdAt`/`updatedAt`/`createdBy`) is
 * exposed by `FaCategoryResponseDto` at all, confirmed by reading it
 * directly — no "created on" field is shown here.
 */
export default function FixedAssetCategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("fixedAssets.categories.detail");
  const categoryQuery = useCategory(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/fixed-assets/categories">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={categoryQuery}>{(category) => <CategoryDetailCard category={category} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component — its own 3 `useGlAccount()` hook calls need a stable component identity across renders. */
function CategoryDetailCard({ category }: { category: FaCategoryResponseDto }) {
  const t = useTranslations("fixedAssets.categories.detail");
  const tMethods = useTranslations("fixedAssets.categoryMethods");
  const costAccountQuery = useGlAccount(category.glCostAccountId);
  const accumDepAccountQuery = useGlAccount(category.glAccumDepAccountId);
  const depExpenseAccountQuery = useGlAccount(category.glDepExpenseAccountId);

  const costLabel = costAccountQuery.data ? `${costAccountQuery.data.code} — ${costAccountQuery.data.name}` : category.glCostAccountId;
  const accumDepLabel = accumDepAccountQuery.data
    ? `${accumDepAccountQuery.data.code} — ${accumDepAccountQuery.data.name}`
    : category.glAccumDepAccountId;
  const depExpenseLabel = depExpenseAccountQuery.data
    ? `${depExpenseAccountQuery.data.code} — ${depExpenseAccountQuery.data.name}`
    : category.glDepExpenseAccountId;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{category.name}</CardTitle>
            <Badge variant="soft-secondary">{tMethods(category.method)}</Badge>
          </div>
        </div>
        <EditCategoryDialog category={category} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("lifeMonthsLabel")}</p>
            <p className="text-sm text-foreground">{t("monthsValue", { count: category.lifeMonths })}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("rateLabel")}</p>
            <p className="text-sm text-foreground">{category.rate ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("residualPctLabel")}</p>
            <p className="text-sm text-foreground">{category.residualPct}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glCostAccountLabel")}</p>
            <p className="text-sm text-foreground">{costLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glAccumDepAccountLabel")}</p>
            <p className="text-sm text-foreground">{accumDepLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glDepExpenseAccountLabel")}</p>
            <p className="text-sm text-foreground">{depExpenseLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
