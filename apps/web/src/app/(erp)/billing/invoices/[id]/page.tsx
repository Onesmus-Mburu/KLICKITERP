"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { InvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { InvoiceLinesTable } from "@/features/billing/components/invoice-lines-table";
import { InvoiceStatusBadge } from "@/features/billing/components/status-badges";
import { PostInvoiceButton } from "@/features/billing/components/post-invoice-button";
import { VoidInvoiceButton } from "@/features/billing/components/void-invoice-button";
import { useInvoice, useInvoiceLines } from "@/features/billing/hooks/use-invoices";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const VOIDABLE_STATUSES = ["POSTED", "PARTIALLY_PAID", "PAID"];

function InvoiceDetail({ invoice }: { invoice: InvoiceResponseDto }) {
  const t = useTranslations("billing.invoices.detail");
  const linesQuery = useInvoiceLines(invoice.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <Link href={`/students/${invoice.studentId}`} className="text-sm text-primary hover:underline">
            {t("viewStudent")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceStatusBadge status={invoice.status} />
          {invoice.status === "DRAFT" && <PostInvoiceButton invoiceId={invoice.id} studentId={invoice.studentId} />}
          {VOIDABLE_STATUSES.includes(invoice.status) && <VoidInvoiceButton invoice={invoice} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("statusLabel")} value={<InvoiceStatusBadge status={invoice.status} />} />
            <ProfileRow label={t("sourceLabel")} value={invoice.source} />
            <ProfileRow label={t("issueDateLabel")} value={invoice.issueDate} />
            <ProfileRow label={t("dueDateLabel")} value={invoice.dueDate} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("amountsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("subtotalLabel")} value={formatMoney(invoice.subtotal)} />
            <ProfileRow label={t("concessionTotalLabel")} value={formatMoney(invoice.concessionTotal)} />
            <ProfileRow label={t("totalLabel")} value={formatMoney(invoice.total)} />
            <ProfileRow label={t("paidAmountLabel")} value={formatMoney(invoice.paidAmount)} />
            <ProfileRow label={t("balanceLabel")} value={<span className="font-semibold">{formatMoney(invoice.balance)}</span>} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
            {(lines) => <InvoiceLinesTable lines={lines} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tCommon = useTranslations("common");
  const router = useRouter();
  const invoiceQuery = useInvoice(id);

  return (
    <div className="space-y-6">
      {/* No standalone `/billing/invoices` list route exists in this slice
          (invoices are only ever reached from a student's Billing card or
          the fresh-generate redirect) — a plain history-back button avoids
          linking to a route that doesn't exist. */}
      <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Button>

      <QueryBoundary query={invoiceQuery}>{(invoice) => <InvoiceDetail invoice={invoice} />}</QueryBoundary>
    </div>
  );
}
