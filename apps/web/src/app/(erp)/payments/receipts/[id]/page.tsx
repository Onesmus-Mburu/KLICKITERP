"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import type { ReceiptDetailResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ReceiptSplitsTable } from "@/features/payments/components/receipt-splits-table";
import { ReceiptAllocationsTable } from "@/features/payments/components/receipt-allocations-table";
import { ReceiptReversalPanel } from "@/features/payments/components/receipt-reversal-panel";
import { useReceipt, useReprintReceipt } from "@/features/payments/hooks/use-receipts";
import { PrintWatermark } from "@/features/document-verification/components/print-watermark";
import { VerificationQr } from "@/features/document-verification/components/verification-qr";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * Receipt detail/print view — splits table + allocations table, rendering
 * ONLY what `GET /payments/receipts/{id}` returned (POST -> navigate -> GET
 * is a genuine second round trip, per the plan; the capture response has no
 * splits/allocations to render inline). Print reuses Billing's own exact
 * `@media print` approach (`print:hidden` on interactive controls, `print:border-0
 * print:shadow-none` on Cards) — see `app/(erp)/billing/fee-structures/[id]/page.tsx`.
 * The "Print" action also calls the real `POST .../reprint` endpoint first
 * (`payments:receipt:reprint`, separately permissioned, small and
 * self-contained per the plan's own "include it, but keep it small" note),
 * then `window.print()`.
 *
 * Phase 6 Slice 16 Part 2: the printable card stack now also carries a
 * `<PrintWatermark>` overlay and a `<VerificationQr token={receipt.verificationToken}/>`
 * stamp in the Summary card's header — see both components' own doc
 * comments (`features/document-verification/components/`).
 */
function ReceiptDetail({ receipt }: { receipt: ReceiptDetailResponseDto }) {
  const t = useTranslations("payments.receiptDetail");
  const reprintMutation = useReprintReceipt(receipt.id);

  async function handlePrint() {
    try {
      await reprintMutation.mutateAsync();
    } finally {
      window.print();
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{receipt.number}</h1>
          <Link href={`/students/${receipt.studentId}`} className="text-sm text-primary hover:underline print:hidden">
            {t("viewStudent")}
          </Link>
        </div>
        <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => void handlePrint()} disabled={reprintMutation.isPending}>
          <Printer className="size-4" />
          {t("printAction")}
        </Button>
      </div>

      {/* Phase 6 Slice 16 Part 2: the printable card stack (Summary/Reversal/
          Splits/Allocations, unchanged order) wrapped in a single `relative`
          container so `<PrintWatermark>` (an `absolute inset-0` overlay,
          `pointer-events-none`) can cover the whole printed document rather
          than just one card — visible on-screen too, per its own doc
          comment's "what you see is what prints" principle, including over
          the print:hidden Reversal card (harmless: low-opacity, click-through). */}
      <div className="relative space-y-6">
        <PrintWatermark />

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
              <VerificationQr token={receipt.verificationToken} />
            </div>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("payerLabel")} value={receipt.payerName} />
            <ProfileRow label={t("dateLabel")} value={receipt.receiptDate} />
            <ProfileRow label={t("totalLabel")} value={<span className="font-semibold">{formatMoney(receipt.total)}</span>} />
            <ProfileRow label={t("statusLabel")} value={receipt.status} />
            <ProfileRow label={t("balanceAfterLabel")} value={formatMoney(receipt.balanceAfter)} />
          </CardContent>
        </Card>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("reversalTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptReversalPanel receipt={receipt} />
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("splitsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptSplitsTable splits={receipt.splits} />
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("allocationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptAllocationsTable allocations={receipt.allocations} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payments.receiptDetail");
  const receiptQuery = useReceipt(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="print:hidden">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <QueryBoundary query={receiptQuery}>{(receipt) => <ReceiptDetail receipt={receipt} />}</QueryBoundary>
    </div>
  );
}
