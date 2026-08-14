"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { formatQty } from "../lib/decimal-qty";
import { useItems } from "../hooks/use-items";
import { useStockBalance, useStockBalances } from "../hooks/use-stock-movements";
import type { StockBalanceResponseDto } from "../api/stock-movements.api";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * balance-lookup half of the Stock Movements screen. **Design choice
 * (documented per this part's own explicit "your call" brief item): ONE
 * combined component, not two separate views** — `itemId` is an OPTIONAL
 * prop that switches this component's own rendering mode:
 *  - `itemId` unset -> a store-wide table (`GET .../balances?storeId=`,
 *    `useStockBalances()`), every `inv_stock_balance` row at that store, item
 *    codes/names resolved via a `useItems({})` lookup map (the same
 *    `Map<id,label>` pattern `items/page.tsx`'s own `categoryNameById`
 *    establishes) since `StockBalanceResponseDto` itself carries only a raw
 *    `itemId`.
 *  - `itemId` set -> a single-row balance card (`GET
 *    .../balance?itemId=&storeId=`, `useStockBalance()`) for exactly that
 *    (item, store) pair — the page composing this component also renders
 *    `<MovementHistoryTable>` alongside it in this mode, since history needs
 *    the identical (itemId, storeId) pair anyway.
 *
 * Chosen over two separate components because both modes share the exact
 * same data shape (`StockBalanceResponseDto`) and the exact same "no balance
 * row exists yet for a brand-new (item, store) pair" empty state — the ONLY
 * real difference is whether the caller has narrowed to one item or not, a
 * single boolean-ish prop rather than two components duplicating the same
 * qty/value formatting and empty-state copy.
 */
export function StockBalanceView({ storeId, itemId }: { storeId: string | undefined; itemId?: string }) {
  const t = useTranslations("inventory.stockMovements");
  const itemsQuery = useItems({});
  const singleBalanceQuery = useStockBalance(itemId, storeId);
  const storeBalancesQuery = useStockBalances(itemId ? undefined : storeId);

  const itemLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, `${item.code} — ${item.name}`);
    return map;
  }, [itemsQuery.data]);

  const columns = React.useMemo<ColumnDef<StockBalanceResponseDto>[]>(
    () => [
      { id: "item", header: t("columns.item"), cell: ({ row }) => itemLabelById.get(row.original.itemId) ?? row.original.itemId },
      { id: "qty", header: t("columns.qty"), cell: ({ row }) => formatQty(row.original.qty) },
      { id: "value", header: t("columns.value"), cell: ({ row }) => formatMoney(row.original.value) },
    ],
    [t, itemLabelById],
  );

  if (!storeId) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("selectStoreFirst")}</p>;
  }

  if (itemId) {
    return (
      <QueryBoundary query={singleBalanceQuery}>
        {(balance) =>
          balance ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("balanceCardTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("columns.qty")}</p>
                  <p className="text-lg font-semibold text-foreground">{formatQty(balance.qty)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("columns.value")}</p>
                  <p className="text-lg font-semibold text-foreground">{formatMoney(balance.value)}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noBalanceYet")}</p>
          )
        }
      </QueryBoundary>
    );
  }

  return (
    <QueryBoundary query={storeBalancesQuery} isEmpty={(d) => d.length === 0}>
      {(balances) => <DataTable columns={columns} data={balances} />}
    </QueryBoundary>
  );
}
