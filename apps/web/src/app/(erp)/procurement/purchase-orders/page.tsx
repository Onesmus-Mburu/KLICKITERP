"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { isDraftPlaceholderNumber, usePurchaseOrders, type PurchaseOrder } from "@/features/procurement/hooks/use-purchase-orders";
import { EMPTY_PO_FILTERS, PoFilters, poFiltersToParams, type PoFiltersState } from "@/features/procurement/components/po-filters";
import { CreatePoDialog } from "@/features/procurement/components/create-po-dialog";

const PO_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  ISSUED: "soft-success",
  PARTIALLY_RECEIVED: "soft-accent",
  RECEIVED: "success",
  CLOSED: "outline",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — the Purchase Orders
 * list: Card + `<PoFilters>` (status + supplier) + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to detail — the same `onRowClick`
 * mechanism `suppliers/page.tsx`/`requisitions/page.tsx` already established.
 * `procurement:po:create`-gated server-side (reused for every GET, no
 * separate view permission exists — see `purchase-orders.api.ts`'s own doc
 * comment); a role missing it hits `<QueryBoundary>`'s own permission-denied
 * state.
 *
 * **The number column shows an honest "Not yet issued" label for any PO
 * still carrying its `DRAFT-<uuid>` placeholder number** (`isDraftPlaceholderNumber()`)
 * — per the task brief's own explicit instruction not to display the raw
 * placeholder as if it were a real number.
 */
export default function PurchaseOrdersPage() {
  const t = useTranslations("procurement.purchaseOrders.list");
  const tStatuses = useTranslations("procurement.purchaseOrders.statuses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [filters, setFilters] = React.useState<PoFiltersState>(EMPTY_PO_FILTERS);
  const poQuery = usePurchaseOrders(poFiltersToParams(filters));
  const suppliersQuery = useSuppliers();

  const supplierNameById = React.useMemo(
    () => new Map((suppliersQuery.data ?? []).map((supplier) => [supplier.id, supplier.name])),
    [suppliersQuery.data],
  );

  const columns = React.useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      {
        id: "number",
        header: t("columns.number"),
        cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? <span className="text-muted-foreground">{t("notYetIssued")}</span> : row.original.number),
      },
      {
        id: "supplier",
        header: t("columns.supplier"),
        cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId,
      },
      {
        id: "revision",
        header: t("columns.revision"),
        cell: ({ row }) => (row.original.revision > 0 ? `R${row.original.revision}` : "—"),
      },
      { id: "total", header: t("columns.total"), cell: ({ row }) => formatMoney(row.original.total) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={PO_STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/procurement/purchase-orders/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, supplierNameById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreatePoDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PoFilters value={filters} onChange={setFilters} />

          <QueryBoundary query={poQuery} isEmpty={(d) => d.length === 0}>
            {(purchaseOrders) => (
              <DataTable columns={columns} data={purchaseOrders} onRowClick={(po) => router.push(`/procurement/purchase-orders/${po.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
