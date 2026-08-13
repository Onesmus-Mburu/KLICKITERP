"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { isDraftPlaceholderNumber, usePurchaseOrder } from "@/features/procurement/hooks/use-purchase-orders";
import { usePostSupplierInvoice, useSupplierInvoice, type SupplierInvoiceResponseDto } from "@/features/procurement/hooks/use-supplier-invoices";
import { InvoiceMatchPanel } from "@/features/procurement/components/invoice-match-panel";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  UNMATCHED: "soft-secondary",
  MATCH_EXCEPTION: "soft-warning",
  MATCHED: "soft-primary",
  POSTED: "soft-success",
  PAID: "success",
  PARTIALLY_PAID: "soft-accent",
};

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — a supplier invoice's
 * detail view: header Card (number, supplier ref, supplier name, PO
 * cross-link, dates, total/paid, status badge, journal link, Post action),
 * then `<InvoiceMatchPanel>` (the real match/resolve-exception UI). Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape every
 * other detail page in this feature folder already established.
 *
 * **Post is a confirm dialog, not a direct click** — it's a real,
 * irreversible GL posting (P-20), matching `<PoStatusActions>`'s own
 * "consequential transition = confirm dialog even with no request body"
 * precedent (Issue), not the lighter "no-body = direct click" treatment this
 * codebase reserves for less consequential transitions (Submit, Reactivate).
 */
function PostInvoiceButton({ invoice }: { invoice: SupplierInvoiceResponseDto }) {
  const t = useTranslations("procurement.supplierInvoices.detail");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const postMutation = usePostSupplierInvoice();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handlePost() {
    setError(null);
    try {
      await postMutation.mutateAsync(invoice.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Send className="size-4" />
          {t("postTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("postConfirmDescription", { number: invoice.number })}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handlePost()} disabled={postMutation.isPending}>
            {postMutation.isPending ? t("posting") : t("postConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierInvoiceDetailBody({ invoice }: { invoice: SupplierInvoiceResponseDto }) {
  const t = useTranslations("procurement.supplierInvoices.detail");
  const tStatuses = useTranslations("procurement.supplierInvoices.statuses");
  const supplierQuery = useSupplier(invoice.supplierId);
  const poQuery = usePurchaseOrder(invoice.poId ?? undefined);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{invoice.number}</CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[invoice.status] ?? "outline"}>{tStatuses(invoice.status)}</Badge>
            </div>
            <CardDescription>{supplierQuery.data?.name ?? invoice.supplierId}</CardDescription>
          </div>
          {invoice.status === "MATCHED" && <PostInvoiceButton invoice={invoice} />}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("supplierRefLabel")}</p>
              <p className="text-sm text-foreground">{invoice.supplierRef}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("poLabel")}</p>
              {invoice.poId ? (
                <Link href={`/procurement/purchase-orders/${invoice.poId}`} className="text-sm text-primary hover:underline">
                  {poQuery.data && !isDraftPlaceholderNumber(poQuery.data.number) ? poQuery.data.number : t("viewPurchaseOrder")}
                </Link>
              ) : (
                <p className="text-sm text-foreground">{t("adHocInvoice")}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("invoiceDateLabel")}</p>
              <p className="text-sm text-foreground">{invoice.invoiceDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("dueDateLabel")}</p>
              <p className="text-sm text-foreground">{invoice.dueDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("totalLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(invoice.total)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paidAmountLabel")}</p>
              <p className="text-sm text-foreground">{formatMoney(invoice.paidAmount)}</p>
            </div>
          </div>

          {invoice.journalId && (
            <p className="text-sm">
              <Link href={`/accounting/journals/${invoice.journalId}`} className="text-primary hover:underline">
                {t("viewJournal")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <InvoiceMatchPanel invoice={invoice} />
    </>
  );
}

export default function SupplierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.supplierInvoices.detail");
  const invoiceQuery = useSupplierInvoice(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/supplier-invoices">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={invoiceQuery}>{(invoice) => <SupplierInvoiceDetailBody invoice={invoice} />}</QueryBoundary>
    </div>
  );
}
