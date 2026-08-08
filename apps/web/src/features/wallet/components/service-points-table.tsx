"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { ServicePointResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { EditServicePointDialog } from "./service-point-dialog";
import { ServicePointOperatorsDialog } from "./service-point-operators-dialog";

/** Phase 6 Slice 11 (Part 3) — `GET wallet-service-points` (`wallet:service-point:manage`) rendered as a plain, unpaginated `<DataTable>` (7 routes total on this controller, `list()` returns a bare array — no `{items,total}` envelope, confirmed by reading `service-points.controller.ts` directly; a small reference list, matching the Settings area's own precedent for similarly-sized lists). */
export function ServicePointsTable({ servicePoints }: { servicePoints: ServicePointResponseDto[] }) {
  const t = useTranslations("wallet.servicePoints.list");
  const tSpType = useTranslations("wallet.servicePointTypes");
  const tCommon = useTranslations("common");

  const columns = React.useMemo<ColumnDef<ServicePointResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "type",
        header: t("columns.type"),
        cell: ({ row }) => tSpType(row.original.type),
      },
      {
        id: "glIncomeAccount",
        header: t("columns.glIncomeAccount"),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.glIncomeAccountId}</span>,
      },
      {
        id: "isActive",
        header: t("columns.isActive"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-secondary"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "perTxnLimit",
        header: t("columns.perTxnLimit"),
        cell: ({ row }) => (row.original.perTxnLimit === null ? "—" : formatMoney(row.original.perTxnLimit)),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <ServicePointOperatorsDialog servicePointId={row.original.id} servicePointName={row.original.name} />
            <EditServicePointDialog servicePoint={row.original} />
          </div>
        ),
      },
    ],
    [t, tSpType, tCommon],
  );

  return <DataTable columns={columns} data={servicePoints} />;
}
