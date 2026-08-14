"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useStores } from "@/features/inventory/hooks/use-stores";
import { useMovementHistory } from "@/features/inventory/hooks/use-stock-movements";
import { StockBalanceView } from "@/features/inventory/components/stock-balance-view";
import { MovementHistoryTable } from "@/features/inventory/components/movement-history-table";
import { IssueStockDialog } from "@/features/inventory/components/issue-stock-dialog";
import { ItemCombobox, type SelectedInventoryItem } from "@/features/inventory/components/item-combobox";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * balance-lookup + history screen, `inventory:movement:view`-gated (a role
 * missing it hits `<QueryBoundary>`'s own permission-denied state).
 *
 * Store picker uses `useStores()` UNFILTERED (unlike `<IssueStockDialog>`'s
 * own `useStores(true)` active-only picker) — a deliberate choice: browsing a
 * DECOMMISSIONED store's own historical balances/movements is a real, valid
 * read-only use case (auditing what was there before it was decommissioned),
 * whereas issuing NEW stock against a decommissioned store is not, so the two
 * pickers reasonably differ.
 *
 * Item picker is OPTIONAL (`<ItemCombobox>` + its own inline clear button) —
 * see `<StockBalanceView>`'s own doc comment for the store-wide-table vs.
 * single-balance-card mode switch this drives. The movement-history table
 * only ever renders once BOTH a store and an item are selected (the
 * `/history` endpoint requires both), stacked directly below the balance
 * view in that mode.
 */
export default function StockMovementsPage() {
  const t = useTranslations("inventory.stockMovements");
  const [storeId, setStoreId] = React.useState("");
  const [item, setItem] = React.useState<SelectedInventoryItem | null>(null);

  const storesQuery = useStores();
  const departmentsQuery = useDepartments();
  const historyQuery = useMovementHistory(item?.id, storeId || undefined);

  const departmentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const department of departmentsQuery.data ?? []) map.set(department.id, department.name);
    return map;
  }, [departmentsQuery.data]);

  function handleStoreChange(next: string) {
    setStoreId(next);
    setItem(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <IssueStockDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
          <CardDescription>{t("filtersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label required>{t("storeLabel")}</Label>
              <Select value={storeId} onValueChange={handleStoreChange} disabled={storesQuery.isLoading}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder={storesQuery.isLoading ? t("loadingStores") : t("storePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(storesQuery.data ?? []).map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:w-72">
              <Label>{t("itemFilterLabel")}</Label>
              <ItemCombobox value={item?.id ?? ""} valueLabel={item ? `${item.code} — ${item.name}` : undefined} onSelect={setItem} disabled={!storeId} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{item ? t("itemBalanceTitle") : t("storeBalancesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StockBalanceView storeId={storeId || undefined} itemId={item?.id} />
        </CardContent>
      </Card>

      {storeId && item && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={historyQuery} isEmpty={(d) => d.length === 0}>
              {(movements) => <MovementHistoryTable movements={movements} departmentLabelById={departmentLabelById} />}
            </QueryBoundary>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
