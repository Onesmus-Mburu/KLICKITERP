"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
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
import {
  PAYMENT_VOUCHER_STATUSES,
  isDraftPlaceholderNumber,
  usePaymentVouchers,
  type PaymentVoucherResponseDto,
  type PaymentVoucherStatus,
} from "@/features/procurement/hooks/use-payment-vouchers";
import { CreatePaymentVoucherDialog } from "@/features/procurement/components/create-payment-voucher-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern every prior part's own filters bar already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12, LAST part of this slice)
 * — the Payment Vouchers list: Card + inline status/supplier filters +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to detail —
 * the same shape `supplier-invoices/page.tsx` (Part 4) already established.
 * `procurement:payment-voucher:manage`-gated server-side (reused for every
 * GET); a role missing it hits `<QueryBoundary>`'s own permission-denied
 * state.
 */
export default function PaymentVouchersPage() {
  const t = useTranslations("procurement.paymentVouchers.list");
  const tMethods = useTranslations("procurement.paymentVouchers.methods");
  const tStatuses = useTranslations("procurement.paymentVouchers.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<PaymentVoucherStatus | "">("");
  const [supplierId, setSupplierId] = React.useState("");

  const vouchersQuery = usePaymentVouchers({ ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) });
  const suppliersQuery = useSuppliers();

  const supplierNameById = React.useMemo(() => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])), [suppliersQuery.data]);

  const columns = React.useMemo<ColumnDef<PaymentVoucherResponseDto>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetExecuted") : row.original.number) },
      { id: "supplier", header: t("columns.supplier"), cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId },
      { id: "method", header: t("columns.method"), cell: ({ row }) => tMethods(row.original.method) },
      { id: "total", header: t("columns.total"), cell: ({ row }) => formatMoney(row.original.total) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tMethods, tStatuses, supplierNameById],
  );

  const hasActiveFilters = !!(status || supplierId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreatePaymentVoucherDialog />
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
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as PaymentVoucherStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {PAYMENT_VOUCHER_STATUSES.map((s) => (
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

          <QueryBoundary query={vouchersQuery} isEmpty={(d) => d.length === 0}>
            {(vouchers) => <DataTable columns={columns} data={vouchers} onRowClick={(v) => router.push(`/procurement/payment-vouchers/${v.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
