"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import type { SupplierInvoiceResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { usePurchaseOrderLines } from "../hooks/use-purchase-orders";
import { useMatchSupplierInvoice } from "../hooks/use-supplier-invoices";
import { parseInvoiceMatchVariance } from "../lib/invoice-match";
import { ResolveExceptionDialog } from "./resolve-exception-dialog";

function ToleranceBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const variant: BadgeProps["variant"] = ok ? "soft-success" : "soft-destructive";
  return (
    <Badge variant={variant}>
      {ok ? <CheckCircle2 className="mr-1 size-3.5" /> : <XCircle className="mr-1 size-3.5" />}
      {children}
    </Badge>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — FR-PROC-007.1's real
 * exception-review UI, built directly around the LIVE-confirmed
 * `matchVariance` shape `../lib/invoice-match.ts` hand-defines (no generated
 * type exists for it). Three real states, never guessed:
 *  - `poId === null` (ad-hoc/service invoice) — matching isn't available at
 *    all, an honest message, no "Run match" button (`matchAgainstPo()`
 *    itself requires `po_id`, confirmed by reading the service directly).
 *  - `matchVariance === null` (never matched yet) — a "Run match" button for
 *    `UNMATCHED` invoices, an honest "not matched yet" hint otherwise.
 *  - `matchVariance` present — the real side-by-side table: invoice total vs
 *    PO-ordered vs GRN-accepted, both tolerance dimensions as individual
 *    pass/fail badges plus the combined `withinTolerance` verdict, and a
 *    per-PO-line breakdown.
 *
 * **The per-line table has NO invoice-line column** — `SupplierInvoicesService`'s
 * own doc comment is explicit that this is "a genuine, honest scope
 * narrowing from a per-line 3-way match to a header-level one" (no
 * `proc_supplier_invoice_line` table exists to compare against; the
 * data-entry `lines` the capture dialog optionally collects are validated
 * once against the PO then DISCARDED, never persisted). This panel's own
 * `linesScopeHint` copy says so explicitly rather than silently presenting
 * an incomplete table as if it were a real per-line invoice comparison.
 *
 * PO line descriptions are resolved client-side (`usePurchaseOrderLines`,
 * mapped `id -> description`) — `MatchVarianceLine` only carries
 * `poLineId`, the same "no denormalized name, resolve client-side" shape
 * this feature folder already established repeatedly.
 */
export function InvoiceMatchPanel({ invoice }: { invoice: SupplierInvoiceResponseDto }) {
  const t = useTranslations("procurement.supplierInvoices.matchPanel");
  const [error, setError] = React.useState<string | null>(null);
  const matchMutation = useMatchSupplierInvoice();
  const linesQuery = usePurchaseOrderLines(invoice.poId ?? undefined);

  const descriptionByLineId = React.useMemo(
    () => new Map((linesQuery.data ?? []).map((line) => [line.id, line.description])),
    [linesQuery.data],
  );

  const variance = invoice.matchVariance ? parseInvoiceMatchVariance(invoice.matchVariance) : null;

  async function handleMatch() {
    setError(null);
    try {
      await matchMutation.mutateAsync(invoice.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (!invoice.poId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("adHocHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === "UNMATCHED" && (
            <Button type="button" onClick={() => void handleMatch()} disabled={matchMutation.isPending}>
              {matchMutation.isPending ? t("matching") : t("runMatchButton")}
            </Button>
          )}
          {invoice.status === "MATCH_EXCEPTION" && <ResolveExceptionDialog invoice={invoice} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {invoice.matchVariance && !variance && (
          <Alert variant="destructive">
            <AlertDescription>{t("varianceUnavailable")}</AlertDescription>
          </Alert>
        )}

        {!invoice.matchVariance && <p className="text-sm text-muted-foreground">{t("notMatchedYetHint")}</p>}

        {variance && (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 sm:grid-cols-4">
              <SummaryStat label={t("invoiceTotalLabel")} value={formatMoney(variance.invoiceTotal)} />
              <SummaryStat label={t("poOrderedQtyLabel")} value={variance.poOrderedQty} />
              <SummaryStat label={t("grnAcceptedQtyLabel")} value={variance.grnAcceptedQty} />
              <SummaryStat label={t("grnAcceptedValueLabel")} value={formatMoney(variance.grnAcceptedValue)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ToleranceBadge ok={variance.qtyWithinTolerance}>{t("qtyToleranceLabel", { percent: variance.tolerances.qtyPercent })}</ToleranceBadge>
              <ToleranceBadge ok={variance.priceWithinTolerance}>
                {t("priceToleranceLabel", { percent: variance.tolerances.pricePercent, absolute: variance.tolerances.absoluteKes })}
              </ToleranceBadge>
              <Badge variant={variance.withinTolerance ? "soft-success" : "soft-destructive"}>
                {t(variance.withinTolerance ? "withinToleranceLabel" : "outsideToleranceLabel")}
              </Badge>
              <span className="text-sm text-muted-foreground">{t("priceVarianceAmountLabel", { amount: formatMoney(variance.priceVarianceAmount) })}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.poLine")}</TableHead>
                    <TableHead>{t("columns.poQty")}</TableHead>
                    <TableHead>{t("columns.grnAcceptedQty")}</TableHead>
                    <TableHead>{t("columns.grnValue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variance.lines.map((line) => (
                    <TableRow key={line.poLineId}>
                      <TableCell>{descriptionByLineId.get(line.poLineId) ?? line.poLineId}</TableCell>
                      <TableCell>{line.poQty}</TableCell>
                      <TableCell>{line.grnAcceptedQty}</TableCell>
                      <TableCell>{formatMoney(line.grnValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">{t("linesScopeHint")}</p>

            {variance.resolution && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground">{t("resolutionLabel", { action: t(`resolutionActions.${variance.resolution.action}`) })}</p>
                <p className="text-muted-foreground">{variance.resolution.note}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
