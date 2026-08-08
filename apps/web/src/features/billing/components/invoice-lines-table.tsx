"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { InvoiceLineResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useFeeCategories } from "../hooks/use-fee-categories";

/** Read-only line breakdown (`GET /invoices/:id/lines`) — invoice lines have no write path from `apps/web` anywhere in this slice (concessions/credit-notes, the only things that mutate a posted line, are deliberately out of scope), so `formatMoney()` only, never `<MoneyInput>`, same discipline `ledger-table.tsx` established. */
export function InvoiceLinesTable({ lines }: { lines: InvoiceLineResponseDto[] }) {
  const t = useTranslations("billing.invoices.detail");
  const categoriesQuery = useFeeCategories();
  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  const columns: ColumnDef<InvoiceLineResponseDto>[] = [
    { accessorKey: "lineNo", header: t("lineNo") },
    {
      id: "category",
      header: t("lineCategory"),
      cell: ({ row }) => categoryNameById.get(row.original.feeCategoryId) ?? row.original.feeCategoryId,
    },
    { accessorKey: "description", header: t("lineDescription") },
    {
      accessorKey: "amount",
      header: t("lineAmount"),
      cell: ({ getValue }) => formatMoney(getValue<string>()),
    },
    {
      accessorKey: "concessionAmount",
      header: t("lineConcession"),
      cell: ({ getValue }) => formatMoney(getValue<string>()),
    },
  ];

  return <DataTable columns={columns} data={lines} />;
}
