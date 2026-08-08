"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import type { TopDefaulterRow } from "@/types/dashboard";

export function DefaultersTable({ rows }: { rows: TopDefaulterRow[] }) {
  const t = useTranslations("dashboard.defaulters");

  const columns: ColumnDef<TopDefaulterRow>[] = [
    { accessorKey: "admissionNo", header: t("admissionNo") },
    {
      id: "name",
      header: t("name"),
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
    },
    { accessorKey: "classId", header: t("class"), cell: ({ getValue }) => getValue<string | null>() ?? "—" },
    {
      accessorKey: "overdueAmount",
      header: t("overdueAmount"),
      cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
    },
    {
      accessorKey: "daysOverdue",
      header: t("daysOverdue"),
      cell: ({ getValue }) => {
        const days = getValue<number>();
        // Slice 1.5 (visual redesign): solid-fill badges -> softly-tinted
        // pills (docs/phase-6/PROGRESS.md), same severity gradient as
        // before (>90 most severe, <=30 least) just restyled.
        return <Badge variant={days > 90 ? "soft-destructive" : days > 30 ? "soft-warning" : "soft-success"}>{days}</Badge>;
      },
    },
  ];

  return <DataTable columns={columns} data={rows} />;
}
