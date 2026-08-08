"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { InvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { InvoiceStatusBadge } from "./status-badges";

/** `GET /billing/invoices?studentId=` — bare array, read-only listing on the student detail page's Billing card. Each row links to the invoice detail route. */
export function StudentInvoicesTable({ invoices }: { invoices: InvoiceResponseDto[] }) {
  const t = useTranslations("billing.invoices.table");
  const tCommon = useTranslations("common");

  const columns = React.useMemo<ColumnDef<InvoiceResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("number") },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      { accessorKey: "issueDate", header: t("issueDate") },
      { accessorKey: "dueDate", header: t("dueDate") },
      {
        accessorKey: "total",
        header: t("total"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        accessorKey: "balance",
        header: t("balance"),
        cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/billing/invoices/${row.original.id}`}>{t("viewDetails")}</Link>
          </Button>
        ),
      },
    ],
    [t, tCommon],
  );

  return <DataTable columns={columns} data={invoices} />;
}
