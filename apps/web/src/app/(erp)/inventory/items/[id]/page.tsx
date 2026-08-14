"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Power } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCategories } from "@/features/inventory/hooks/use-categories";
import { formatCost, formatQty } from "@/features/inventory/lib/decimal-qty";
import { useItem, useUpdateItem } from "@/features/inventory/hooks/use-items";
import { EditItemDialog } from "@/features/inventory/components/edit-item-dialog";

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — an item's
 * detail page: header Card (code/name/type/uom/barcode/category, a status
 * badge), reorder policy (`reorderLevel`/`reorderQty` via `formatQty()`,
 * 4dp — never `formatMoney()`), the GL trio resolved to `code — name` labels
 * via `useAccounts()`, `salePrice` (via `formatMoney()`, the one genuinely
 * `Money`-typed field here) shown only for RESALE items, and `avgCost` (via
 * `formatCost()`, 6dp) always shown READ-ONLY — this page never renders an
 * input for it, matching every other Inventory screen in this part. Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * `app/(erp)/procurement/suppliers/[id]/page.tsx` establishes.
 *
 * The activate/deactivate toggle is a direct-click button here (no confirm
 * dialog, no dedicated endpoint — plain `updateItem(id, {isActive})`, the
 * same reversible-toggle treatment `cost-centers/page.tsx`'s own Activate
 * button and `stores/page.tsx`'s own row-level toggle establish).
 */
export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("inventory.items.detail");
  const tItemTypes = useTranslations("inventory.items.itemTypes");
  const itemQuery = useItem(id);
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const updateMutation = useUpdateItem();
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const categoryNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const accountLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accountsQuery.data ?? []) map.set(a.id, `${a.code} — ${a.name}`);
    return map;
  }, [accountsQuery.data]);

  async function handleToggleActive(isActive: boolean) {
    setToggleError(null);
    try {
      await updateMutation.mutateAsync({ id, dto: { isActive } });
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/inventory/items">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={itemQuery}>
        {(item) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base text-foreground">{item.name}</CardTitle>
                    <Badge variant="soft-secondary">{tItemTypes(item.itemType)}</Badge>
                    <Badge variant={item.isActive ? "soft-success" : "soft-secondary"}>
                      {item.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <CardDescription>{t("codePrefix", { code: item.code })}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EditItemDialog item={item} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleToggleActive(!item.isActive)}
                    disabled={updateMutation.isPending}
                  >
                    <Power className="size-4" />
                    {item.isActive ? t("deactivateButton") : t("activateButton")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {toggleError && (
                  <Alert variant="destructive">
                    <AlertDescription>{toggleError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoryLabel")}</p>
                    <p className="text-sm text-foreground">{categoryNameById.get(item.categoryId) ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("uomLabel")}</p>
                    <p className="text-sm text-foreground">{item.uom}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("barcodeLabel")}</p>
                    <p className="text-sm text-foreground">{item.barcode ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("reorderLevelLabel")}</p>
                    <p className="text-sm text-foreground">{item.reorderLevel ? formatQty(item.reorderLevel) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("reorderQtyLabel")}</p>
                    <p className="text-sm text-foreground">{item.reorderQty ? formatQty(item.reorderQty) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("avgCostLabel")}</p>
                    <p className="text-sm text-foreground">{formatCost(item.avgCost)}</p>
                  </div>
                </div>

                {item.itemType === "RESALE" && (
                  <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("salePriceLabel")}</p>
                      <p className="text-sm text-foreground">{item.salePrice ? formatMoney(item.salePrice) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glIncomeAccountLabel")}</p>
                      <p className="text-sm text-foreground">
                        {item.glIncomeAccountId ? (accountLabelById.get(item.glIncomeAccountId) ?? item.glIncomeAccountId) : "—"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glAssetAccountLabel")}</p>
                    <p className="text-sm text-foreground">{accountLabelById.get(item.glAssetAccountId) ?? item.glAssetAccountId}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glExpenseAccountLabel")}</p>
                    <p className="text-sm text-foreground">{accountLabelById.get(item.glExpenseAccountId) ?? item.glExpenseAccountId}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
