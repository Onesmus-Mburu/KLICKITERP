"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TransferResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useStores } from "@/features/inventory/hooks/use-stores";
import { useTransfers } from "@/features/inventory/hooks/use-transfers";

const ALL_VALUE = "__all__";
const TRANSFER_STATUSES = ["ISSUED", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ISSUED: "soft-warning",
  IN_TRANSIT: "soft-primary",
  RECEIVED: "soft-success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * transfers list: status/from-store/to-store filters (all optional, feeding
 * `TransfersController_list`'s own conditional-query-object fix, see
 * `transfers.api.ts`'s own doc comment) + a "New Transfer" entry point
 * linking to the dedicated `/inventory/transfers/new` page (this part's own
 * "dialog vs. dedicated page" judgment call, see `transfer-form.tsx`'s own
 * doc comment). `inventory:transfer:issue`-gated (reused across every GET on
 * this controller — a role missing it hits `<QueryBoundary>`'s own
 * permission-denied state).
 */
export default function TransfersPage() {
  const t = useTranslations("inventory.transfers.list");
  const tStatuses = useTranslations("inventory.transfers.statuses");
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState(ALL_VALUE);
  const [fromStoreFilter, setFromStoreFilter] = React.useState(ALL_VALUE);
  const [toStoreFilter, setToStoreFilter] = React.useState(ALL_VALUE);

  const storesQuery = useStores();
  const transfersQuery = useTransfers({
    ...(statusFilter !== ALL_VALUE ? { status: statusFilter } : {}),
    ...(fromStoreFilter !== ALL_VALUE ? { fromStoreId: fromStoreFilter } : {}),
    ...(toStoreFilter !== ALL_VALUE ? { toStoreId: toStoreFilter } : {}),
  });

  const storeNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const store of storesQuery.data ?? []) map.set(store.id, store.name);
    return map;
  }, [storesQuery.data]);

  const columns = React.useMemo<ColumnDef<TransferResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      { id: "fromStore", header: t("columns.fromStore"), cell: ({ row }) => storeNameById.get(row.original.fromStoreId) ?? row.original.fromStoreId },
      { id: "toStore", header: t("columns.toStore"), cell: ({ row }) => storeNameById.get(row.original.toStoreId) ?? row.original.toStoreId },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tStatuses, storeNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/inventory/transfers/new">
            <Plus className="size-4" />
            {t("newTransfer")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("statusFilterLabel")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStatuses")}</SelectItem>
                  {TRANSFER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {tStatuses(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("fromStoreFilterLabel")}</Label>
              <Select value={fromStoreFilter} onValueChange={setFromStoreFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStores")}</SelectItem>
                  {(storesQuery.data ?? []).map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("toStoreFilterLabel")}</Label>
              <Select value={toStoreFilter} onValueChange={setToStoreFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>{t("allStores")}</SelectItem>
                  {(storesQuery.data ?? []).map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={transfersQuery} isEmpty={(d) => d.length === 0}>
            {(transfers) => <DataTable columns={columns} data={transfers} onRowClick={(transfer) => router.push(`/inventory/transfers/${transfer.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
