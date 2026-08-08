"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { LedgerStatementRowDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";

/** Read-only — `debit`/`credit`/`runningBalance` are decimal strings rendered via `formatMoney()`, NEVER `<MoneyInput>` (there is no write path for `std_ledger_entry` via HTTP anywhere in this domain). */
export function LedgerTable({ rows }: { rows: LedgerStatementRowDto[] }) {
  const t = useTranslations("students.ledger");

  const columns: ColumnDef<LedgerStatementRowDto>[] = [
    { accessorKey: "entryDate", header: t("date") },
    { accessorKey: "docType", header: t("docType") },
    { accessorKey: "docNumber", header: t("docNumber") },
    { accessorKey: "memo", header: t("memo"), cell: ({ getValue }) => getValue<string | null>() ?? "—" },
    { accessorKey: "debit", header: t("debit"), cell: ({ getValue }) => formatMoney(getValue<string>()) },
    { accessorKey: "credit", header: t("credit"), cell: ({ getValue }) => formatMoney(getValue<string>()) },
    {
      accessorKey: "runningBalance",
      header: t("runningBalance"),
      cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
    },
  ];

  return <DataTable columns={columns} data={rows} />;
}
