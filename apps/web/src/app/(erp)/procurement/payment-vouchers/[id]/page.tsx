"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { useSupplierInvoices } from "@/features/procurement/hooks/use-supplier-invoices";
import {
  isDraftPlaceholderNumber,
  usePaymentVoucher,
  usePaymentVoucherAllocations,
  type PaymentVoucherResponseDto,
} from "@/features/procurement/hooks/use-payment-vouchers";
import { PaymentVoucherStatusActions } from "@/features/procurement/components/payment-voucher-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — a payment voucher's
 * detail page: header Card (number — an honest "Not yet executed" label
 * while it's still the `DRAFT-<uuid>` placeholder, matching
 * `supplier-invoices/[id]/page.tsx`'s own PO-cross-link treatment of the
 * identical placeholder shape — method, total, remittance flag, journal
 * link, status badge, `<PaymentVoucherStatusActions>`), then an allocations
 * table resolving each `supplierInvoiceId` to its real invoice number via
 * the same supplier's own already-fetched invoice list (no bulk
 * "get invoices by ids" endpoint exists, so this reuses the one
 * `useSupplierInvoices({supplierId})` call rather than N individual detail
 * fetches — the same `supplierNameById`-style client-side lookup-map
 * pattern `supplier-invoices/page.tsx` already established for supplier
 * names).
 */
function PaymentVoucherDetailBody({ voucher }: { voucher: PaymentVoucherResponseDto }) {
  const t = useTranslations("procurement.paymentVouchers.detail");
  const tMethods = useTranslations("procurement.paymentVouchers.methods");
  const tStatuses = useTranslations("procurement.paymentVouchers.statuses");
  const supplierQuery = useSupplier(voucher.supplierId);
  const allocationsQuery = usePaymentVoucherAllocations(voucher.id);
  const invoicesQuery = useSupplierInvoices({ supplierId: voucher.supplierId });

  const invoiceNumberById = React.useMemo(
    () => new Map((invoicesQuery.data ?? []).map((inv) => [inv.id, inv.number])),
    [invoicesQuery.data],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">
                {isDraftPlaceholderNumber(voucher.number) ? t("notYetExecuted") : voucher.number}
              </CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[voucher.status] ?? "outline"}>{tStatuses(voucher.status)}</Badge>
            </div>
            <CardDescription>{supplierQuery.data?.name ?? voucher.supplierId}</CardDescription>
          </div>
          <PaymentVoucherStatusActions voucher={voucher} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("methodLabel")}</p>
              <p className="text-sm text-foreground">{tMethods(voucher.method)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("totalLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(voucher.total)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("remittanceLabel")}</p>
              <p className="text-sm text-foreground">{voucher.remittanceSent ? t("remittanceSent") : t("remittanceNotSent")}</p>
            </div>
          </div>

          {voucher.journalId && (
            <p className="text-sm">
              <Link href={`/accounting/journals/${voucher.journalId}`} className="text-primary hover:underline">
                {t("viewJournal")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("allocationsTitle")}</CardTitle>
          <CardDescription>{t("allocationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={allocationsQuery} isEmpty={(d) => d.length === 0}>
            {(allocations) => (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("columns.invoice")}</TableHead>
                      <TableHead>{t("columns.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((allocation) => (
                      <TableRow key={allocation.id}>
                        <TableCell>
                          <Link href={`/procurement/supplier-invoices/${allocation.supplierInvoiceId}`} className="text-primary hover:underline">
                            {invoiceNumberById.get(allocation.supplierInvoiceId) ?? allocation.supplierInvoiceId}
                          </Link>
                        </TableCell>
                        <TableCell>{formatMoney(allocation.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </>
  );
}

export default function PaymentVoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.paymentVouchers.detail");
  const voucherQuery = usePaymentVoucher(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/payment-vouchers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={voucherQuery}>{(voucher) => <PaymentVoucherDetailBody voucher={voucher} />}</QueryBoundary>
    </div>
  );
}
