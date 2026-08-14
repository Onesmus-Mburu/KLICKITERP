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
import { useItems } from "@/features/inventory/hooks/use-items";
import { useStores } from "@/features/inventory/hooks/use-stores";
import { useStockTake, useStockTakeLines } from "@/features/inventory/hooks/use-stock-takes";
import { StockTakeCountForm } from "@/features/inventory/components/stock-take-count-form";
import { StockTakeStatusActions } from "@/features/inventory/components/stock-take-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-secondary",
  COUNTING: "soft-primary",
  REVIEW: "soft-accent",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) — a
 * stock take's detail view: header (number, status badge, store, snapshot
 * timestamp) + `<StockTakeStatusActions>` (submit/decide/post) +
 * `<StockTakeCountForm>` (the lines table — count entry while
 * OPEN/COUNTING, the read-only variance report from REVIEW onward). Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * `transfers/[id]/page.tsx` establishes.
 */
export default function StockTakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("inventory.stockTakes.detail");
  const tStatuses = useTranslations("inventory.stockTakes.statuses");
  const stockTakeQuery = useStockTake(id);
  const linesQuery = useStockTakeLines(id);
  const storesQuery = useStores();
  const itemsQuery = useItems({});

  const storeNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const store of storesQuery.data ?? []) map.set(store.id, store.name);
    return map;
  }, [storesQuery.data]);

  const itemLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, `${item.code} — ${item.name}`);
    return map;
  }, [itemsQuery.data]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/inventory/stock-takes">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={stockTakeQuery}>
        {(stockTake) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{stockTake.number}</CardTitle>
                  <CardDescription>{storeNameById.get(stockTake.storeId) ?? stockTake.storeId}</CardDescription>
                </div>
                <Badge variant={STATUS_BADGE_VARIANT[stockTake.status] ?? "outline"}>{tStatuses(stockTake.status)}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">{t("snapshotAtLabel")}</p>
                    <p className="font-medium text-foreground">{new Date(stockTake.snapshotAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("journalLabel")}</p>
                    <p className="font-medium text-foreground">{stockTake.journalId ?? t("journalNotPosted")}</p>
                  </div>
                </div>
                <StockTakeStatusActions stockTake={stockTake} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
                <CardDescription>{t("linesDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
                  {(lines) => <StockTakeCountForm stockTakeId={stockTake.id} status={stockTake.status} lines={lines} itemLabelById={itemLabelById} />}
                </QueryBoundary>
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
