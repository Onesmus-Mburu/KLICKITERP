"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import type { ContractResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { CONTRACT_STATUSES, useContracts, type ContractStatus } from "@/features/procurement/hooks/use-contracts";
import { CreateContractDialog } from "@/features/procurement/components/create-contract-dialog";
import { ExpiringContractsWidget } from "@/features/procurement/components/expiring-contracts-widget";

const ALL_SENTINEL = "__all__";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  EXPIRED: "soft-secondary",
  TERMINATED: "soft-destructive",
};

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12, LAST part of this slice)
 * — the Contracts list: the `<ExpiringContractsWidget>` above a filterable
 * Card + `<DataTable>` inside `<QueryBoundary>`, row click navigates to
 * detail — the same list shape every prior part in this feature folder
 * already established, plus the one dashboard-style widget this part's plan
 * calls for. `procurement:contract:manage`-gated server-side (reused for
 * every GET — no separate view permission exists, confirmed by reading
 * `ContractsController` directly); a role missing it hits
 * `<QueryBoundary>`'s own permission-denied state (on both this list AND the
 * widget above it, since both call the same permission).
 */
export default function ContractsPage() {
  const t = useTranslations("procurement.contracts.list");
  const tStatuses = useTranslations("procurement.contracts.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<ContractStatus | "">("");
  const [supplierId, setSupplierId] = React.useState("");

  const contractsQuery = useContracts({ ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) });
  const suppliersQuery = useSuppliers();

  const supplierNameById = React.useMemo(() => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])), [suppliersQuery.data]);

  const columns = React.useMemo<ColumnDef<ContractResponseDto>[]>(
    () => [
      { id: "title", header: t("columns.title"), cell: ({ row }) => row.original.title },
      { id: "supplier", header: t("columns.supplier"), cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId },
      { id: "startsOn", header: t("columns.startsOn"), cell: ({ row }) => row.original.startsOn },
      { id: "endsOn", header: t("columns.endsOn"), cell: ({ row }) => row.original.endsOn },
      { id: "value", header: t("columns.value"), cell: ({ row }) => (row.original.value ? formatMoney(row.original.value) : "—") },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tStatuses, supplierNameById],
  );

  const hasActiveFilters = !!(status || supplierId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateContractDialog />
      </div>

      <ExpiringContractsWidget />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as ContractStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {CONTRACT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.supplierLabel")}</Label>
              <Select value={supplierId || ALL_SENTINEL} onValueChange={(v) => setSupplierId(v === ALL_SENTINEL ? "" : v)} disabled={suppliersQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allSuppliers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allSuppliers")}</SelectItem>
                  {(suppliersQuery.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("");
                  setSupplierId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={contractsQuery} isEmpty={(d) => d.length === 0}>
            {(contracts) => <DataTable columns={columns} data={contracts} onRowClick={(c) => router.push(`/procurement/contracts/${c.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
