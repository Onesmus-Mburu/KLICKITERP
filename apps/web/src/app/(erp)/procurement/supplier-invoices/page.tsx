"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SupplierInvoiceResponseDto } from "@klickit/contracts";
import { X } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { SUPPLIER_INVOICE_STATUSES, useSupplierInvoices, type SupplierInvoiceStatus } from "@/features/procurement/hooks/use-supplier-invoices";
import { CaptureSupplierInvoiceDialog } from "@/features/procurement/components/capture-supplier-invoice-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern `po-filters.tsx` (Part 3) already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  UNMATCHED: "soft-secondary",
  MATCH_EXCEPTION: "soft-warning",
  MATCHED: "soft-primary",
  POSTED: "soft-success",
  PAID: "success",
  PARTIALLY_PAID: "soft-accent",
};

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — the Supplier Invoices
 * list: Card + inline status/supplier filters + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to detail — the same shape
 * `purchase-orders/page.tsx` (Part 3) already established. Filters are
 * inlined directly in this page rather than a separate `*-filters.tsx`
 * component — the task brief's own component list for this part names
 * exactly 5 components (none of them a filters component), unlike Parts 2-3
 * which explicitly listed `requisition-filters.tsx`/`po-filters.tsx`; this
 * follows that list precisely rather than inventing an extra file.
 * `procurement:supplier-invoice:manage`-gated server-side (reused for every
 * GET — no separate view permission exists, confirmed by reading
 * `SupplierInvoicesController` directly); a role missing it hits
 * `<QueryBoundary>`'s own permission-denied state.
 */
export default function SupplierInvoicesPage() {
  const t = useTranslations("procurement.supplierInvoices.list");
  const tStatuses = useTranslations("procurement.supplierInvoices.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<SupplierInvoiceStatus | "">("");
  const [supplierId, setSupplierId] = React.useState("");

  const invoicesQuery = useSupplierInvoices({ ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) });
  const suppliersQuery = useSuppliers();

  const supplierNameById = React.useMemo(
    () => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])),
    [suppliersQuery.data],
  );

  const columns = React.useMemo<ColumnDef<SupplierInvoiceResponseDto>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => row.original.number },
      { id: "supplierRef", header: t("columns.supplierRef"), cell: ({ row }) => row.original.supplierRef },
      { id: "supplier", header: t("columns.supplier"), cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId },
      { id: "total", header: t("columns.total"), cell: ({ row }) => formatMoney(row.original.total) },
      { id: "dueDate", header: t("columns.dueDate"), cell: ({ row }) => row.original.dueDate },
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
        <CaptureSupplierInvoiceDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as SupplierInvoiceStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {SUPPLIER_INVOICE_STATUSES.map((s) => (
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

          <QueryBoundary query={invoicesQuery} isEmpty={(d) => d.length === 0}>
            {(invoices) => (
              <DataTable columns={columns} data={invoices} onRowClick={(inv) => router.push(`/procurement/supplier-invoices/${inv.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
