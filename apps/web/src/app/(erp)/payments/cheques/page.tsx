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
import { useUnclearedCheques } from "@/features/payments/hooks/use-cheques";
import { ChequeStatusBadge } from "@/features/payments/components/payment-status-badges";
import { ClearChequeDialog } from "@/features/payments/components/clear-cheque-dialog";
import { BounceChequeDialog } from "@/features/payments/components/bounce-cheque-dialog";
import type { Cheque } from "@/features/payments/types";

/**
 * `payments:cheque:manage` — a QUEUE view, not a full history (`GET
 * /payments/cheques` only ever returns `UNCLEARED` rows, confirmed by
 * reading `ChequesService.listUncleared()` directly). A cheque that's been
 * cleared or bounced simply disappears from this table on its next refetch —
 * there is no separate history endpoint to show it afterward.
 */
export default function ChequesPage() {
  const t = useTranslations("payments.cheques");
  const chequesQuery = useUnclearedCheques();

  const columns = React.useMemo<ColumnDef<Cheque>[]>(
    () => [
      { accessorKey: "chequeNo", header: t("chequeNo") },
      { accessorKey: "bankName", header: t("bankName") },
      { accessorKey: "drawer", header: t("drawer") },
      { accessorKey: "chequeDate", header: t("chequeDate") },
      { accessorKey: "amount", header: t("amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      { accessorKey: "status", header: t("status"), cell: ({ row }) => <ChequeStatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: t("actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <ClearChequeDialog cheque={row.original} />
            <BounceChequeDialog cheque={row.original} />
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
          <QueryBoundary query={chequesQuery} isEmpty={(d) => d.length === 0}>
            {(cheques) => <DataTable columns={columns} data={cheques} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
