"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TransferLineResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatCost, formatQty } from "@/features/inventory/lib/decimal-qty";
import { useItems } from "@/features/inventory/hooks/use-items";
import { useStores } from "@/features/inventory/hooks/use-stores";
import { useTransfer, useTransferLines } from "@/features/inventory/hooks/use-transfers";
import { TransferStatusActions } from "@/features/inventory/components/transfer-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ISSUED: "soft-warning",
  IN_TRANSIT: "soft-primary",
  RECEIVED: "soft-success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — a
 * transfer's detail view: header (number, status badge, from/to store,
 * issued/received-by) + its lines table + `<TransferStatusActions>`
 * (receive/cancel, gated by status). Same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `accounting/journals/[id]/page.tsx`
 * establishes.
 */
export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("inventory.transfers.detail");
  const tStatuses = useTranslations("inventory.transfers.statuses");
  const transferQuery = useTransfer(id);
  const linesQuery = useTransferLines(id);
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

  const columns = React.useMemo<ColumnDef<TransferLineResponseDto>[]>(
    () => [
      { accessorKey: "lineNo", header: t("columns.lineNo") },
      { id: "item", header: t("columns.item"), cell: ({ row }) => itemLabelById.get(row.original.itemId) ?? row.original.itemId },
      { id: "qty", header: t("columns.qty"), cell: ({ row }) => formatQty(row.original.qty) },
      { id: "unitCost", header: t("columns.unitCost"), cell: ({ row }) => formatCost(row.original.unitCost) },
    ],
    [t, itemLabelById],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/inventory/transfers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={transferQuery}>
        {(transfer) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{transfer.number}</CardTitle>
                  <CardDescription>
                    {t("routeDescription", { from: storeNameById.get(transfer.fromStoreId) ?? transfer.fromStoreId, to: storeNameById.get(transfer.toStoreId) ?? transfer.toStoreId })}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGE_VARIANT[transfer.status] ?? "outline"}>{tStatuses(transfer.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">{t("issuedByLabel")}</p>
                    <p className="font-medium text-foreground">{transfer.issuedBy}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("receivedByLabel")}</p>
                    <p className="font-medium text-foreground">{transfer.receivedBy ?? "—"}</p>
                  </div>
                </div>
                <TransferStatusActions transfer={transfer} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
                  {(lines) => <DataTable columns={columns} data={lines} />}
                </QueryBoundary>
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
