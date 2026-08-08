"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useOpenSuspenseItems } from "@/features/payments/hooks/use-suspense";
import { MatchSuspenseDialog } from "@/features/payments/components/match-suspense-dialog";
import type { SuspenseItem } from "@/features/payments/types";

/**
 * `payments:suspense:manage` — `GET /payments/suspense` only ever returns
 * `OPEN` items, oldest received first (confirmed by reading
 * `SuspenseService.listOpen()` directly) — there is no history endpoint, so
 * a matched/refunded item simply disappears from this table on its next
 * refetch. `payments/suspense/[id]` (the new Slice 6 detail route) is where
 * a resolved item is still reachable afterward.
 */
export default function SuspensePage() {
  const t = useTranslations("payments.suspense");
  const itemsQuery = useOpenSuspenseItems();

  const columns = React.useMemo<ColumnDef<SuspenseItem>[]>(
    () => [
      { accessorKey: "source", header: t("source") },
      { accessorKey: "amount", header: t("amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      { accessorKey: "externalRef", header: t("externalRef") },
      { accessorKey: "receivedAt", header: t("receivedAt"), cell: ({ row }) => new Date(row.original.receivedAt).toLocaleString() },
      {
        id: "actions",
        header: t("actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <MatchSuspenseDialog item={row.original} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/payments/suspense/${row.original.id}`}>{t("viewTrigger")}</Link>
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={itemsQuery} isEmpty={(d) => d.length === 0}>
            {(items) => <DataTable columns={columns} data={items} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
