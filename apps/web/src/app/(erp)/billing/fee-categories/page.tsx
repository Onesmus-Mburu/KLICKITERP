"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FeeCategoryResponseDto } from "@klickit/contracts";
import { Layers, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useActivateFeeCategory, useDeactivateFeeCategory, useFeeCategories } from "@/features/billing/hooks/use-fee-categories";
import { useIncomeAccounts } from "@/features/billing/hooks/use-accounts";
import { FeeCategoryDialog } from "@/features/billing/components/fee-category-dialog";

/**
 * Phase 6 Slice 3 (Billing core loop) — Fee Categories management, mirroring
 * `app/(erp)/students/classes/page.tsx` as closely as possible per the plan:
 * a `<DataTable>` + create/edit `<Dialog>` + activate/deactivate row
 * actions. No delete endpoint exists on `FeeCategoriesController` (confirmed
 * by reading it) — activate/deactivate toggle only, same as that page's own
 * classes-before-delete-was-added shape.
 */
function GlAccountCell({ accountId }: { accountId: string }) {
  const accountsQuery = useIncomeAccounts();
  const account = accountsQuery.data?.find((a) => a.id === accountId);
  return <span className="font-mono text-xs">{account ? `${account.code} — ${account.name}` : accountId}</span>;
}

export default function FeeCategoriesPage() {
  const t = useTranslations("billing.feeCategories");
  const tCommon = useTranslations("common");
  const categoriesQuery = useFeeCategories();
  const deactivateMutation = useDeactivateFeeCategory();
  const activateMutation = useActivateFeeCategory();

  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<FeeCategoryResponseDto | undefined>(undefined);

  const columns = React.useMemo<ColumnDef<FeeCategoryResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("table.name") },
      {
        id: "glAccount",
        header: t("table.glAccount"),
        cell: ({ row }) => <GlAccountCell accountId={row.original.glIncomeAccountId} />,
      },
      {
        accessorKey: "taxable",
        header: t("table.taxable"),
        cell: ({ getValue }) => (getValue<boolean>() ? tCommon("active") : "—"),
      },
      { accessorKey: "priority", header: t("table.priority") },
      {
        id: "isActive",
        header: t("table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-destructive"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingCategory(row.original);
                setDialogMode("edit");
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-4" />
              {tCommon("edit")}
            </Button>
            {row.original.isActive ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-tint-destructive hover:text-destructive"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(row.original.id)}
              >
                {t("deactivate")}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(row.original.id)}>
                {t("activate")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, tCommon, deactivateMutation, activateMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/billing/fee-structures">
              <Layers className="size-4" />
              {t("manageFeeStructures")}
            </Link>
          </Button>
          <Button
            onClick={() => {
              setEditingCategory(undefined);
              setDialogMode("create");
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("newCategory")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={categoriesQuery} isEmpty={(d) => d.length === 0}>
            {(data) => <DataTable columns={columns} data={data} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <FeeCategoryDialog mode={dialogMode} category={editingCategory} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
