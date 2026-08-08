"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SyncLogResponseDto } from "@klickit/contracts";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { SyncLogStatusBadge } from "./sync-log-status-badge";

/** `SyncController.listLog()` genuinely returns `{items, meta}` (confirmed by reading the controller directly) — a real `<DataTable serverPagination>`. */
export function SyncLogTable({ logs, serverPagination }: { logs: SyncLogResponseDto[]; serverPagination: ServerPaginationState }) {
  const t = useTranslations("settings.accountingSync");

  const columns = React.useMemo<ColumnDef<SyncLogResponseDto>[]>(
    () => [
      { accessorKey: "kind", header: t("columns.kind") },
      { accessorKey: "direction", header: t("columns.direction") },
      { accessorKey: "entityType", header: t("columns.entityType") },
      { id: "entityId", header: t("columns.entityId"), cell: ({ row }) => <span className="break-all text-xs">{row.original.entityId}</span> },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <SyncLogStatusBadge status={row.original.status} /> },
      { id: "providerRef", header: t("columns.providerRef"), cell: ({ row }) => row.original.providerRef ?? "—" },
      {
        id: "error",
        header: t("columns.error"),
        cell: ({ row }) => (row.original.error ? <span className="text-xs text-destructive">{row.original.error}</span> : "—"),
      },
      { id: "at", header: t("columns.at"), cell: ({ row }) => new Date(row.original.at).toLocaleString() },
    ],
    [t],
  );

  return <DataTable columns={columns} data={logs} serverPagination={serverPagination} />;
}
