"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useRequisition } from "@/features/procurement/hooks/use-requisitions";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import {
  isDraftPlaceholderNumber,
  usePurchaseOrder,
  usePurchaseOrderLines,
  useSupersedingPurchaseOrder,
  type PurchaseOrder,
} from "@/features/procurement/hooks/use-purchase-orders";
import { PoStatusActions } from "@/features/procurement/components/po-status-actions";
import { ReceiveGrnDialog } from "@/features/procurement/components/receive-grn-dialog";
import { GrnList } from "@/features/procurement/components/grn-list";

/** Duplicated from `../page.tsx`'s own identical map, not imported — matches `requisitions/[id]/page.tsx`'s (Part 2) own established precedent of a small, locally-duplicated status-badge map per page rather than importing across two route-segment files. */
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
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — a purchase order's
 * detail view: header Card (number — honestly labeled "Not yet issued" while
 * still `DRAFT-<uuid>`, supplier, requisition/quotation cross-links,
 * order/delivery/payment terms, subtotal/tax/total, issued-at,
 * `<PoStatusActions>`), a revision-history Card (shown only when this PO
 * either supersedes another or has itself been superseded — see below), and
 * a read-only lines Card. Same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape every other detail page in this
 * feature folder already established.
 *
 * **`<PoDetailBody>` is its own real component, not an inline arrow function
 * inside `<QueryBoundary>`'s `children` render-prop** — it needs several of
 * its own hooks (`useSupplier`/`useRequisition`/`usePurchaseOrder`/
 * `useSupersedingPurchaseOrder`), and `<QueryBoundary>` only invokes
 * `children(data)` in its "populated" branch (see that component's own
 * `resolveQueryBoundaryState()`) — calling hooks from inside a callback that
 * isn't itself always invoked would violate the rules of hooks (the hook
 * call count seen by `<QueryBoundary>`'s own fiber would vary by state).
 * Wrapping the body in a real `<PoDetailBody po={po} />` element gives it its
 * own stable fiber with a consistent hook order regardless of what
 * `<QueryBoundary>` does around it.
 *
 * **Lines are ALWAYS read-only here** — unlike `requisition-line-editor.tsx`'s
 * (Part 2) own DRAFT-only add/edit/delete, `PurchaseOrdersController` has no
 * line-level mutation route at all (confirmed by reading it directly): PO
 * lines are set once at creation and only ever replaced wholesale via
 * `revise()` (a brand-new PO), never edited in place. `receivedQty` is shown
 * as-is — Part 3 documented it as permanently `"0.0000"` pending GRN; Part 4
 * (this pass) is what actually increments it via `<ReceiveGrnDialog>`
 * (`GrnService.receive()`'s own running total per PO line), so this column
 * now genuinely moves once a real receipt is posted.
 *
 * **Phase 6 Slice 18 Part 4** — `<ReceiveGrnDialog>` (ISSUED/PARTIALLY_RECEIVED
 * only, self-gates) sits next to `<PoStatusActions>` in the header, and a GRN
 * History card (`<GrnList>`) is shown once the PO has a real, non-placeholder
 * number (`!isDraftPlaceholderNumber(po.number)`) — a GRN is only ever
 * creatable once a PO is ISSUED, so a still-DRAFT/PENDING_APPROVAL/APPROVED PO
 * (still carrying its placeholder number) genuinely has no GRN history to
 * show yet, and this reuses that existing check rather than hand-listing the
 * receivable statuses again. GRN itself has no dedicated route of its own —
 * see `grn.api.ts`'s own doc comment for the full reasoning.
 *
 * **Revision history, both directions**: `supersedesId` (this PO -> its
 * original) is a direct field on the response and just needs the original's
 * NUMBER resolved (`usePurchaseOrder(po.supersedesId)`). The FORWARD
 * direction (this PO -> whatever revision superseded IT) has no field at all
 * — `useSupersedingPurchaseOrder()`'s own doc comment explains the
 * client-side scan this relies on instead, since no backend query for it
 * exists.
 */
function PoDetailBody({ po }: { po: PurchaseOrder }) {
  const t = useTranslations("procurement.purchaseOrders.detail");
  const tStatuses = useTranslations("procurement.purchaseOrders.statuses");
  const supplierQuery = useSupplier(po.supplierId);
  const requisitionQuery = useRequisition(po.requisitionId ?? undefined);
  const originalPoQuery = usePurchaseOrder(po.supersedesId ?? undefined);
  const supersedingPoQuery = useSupersedingPurchaseOrder(po.id);
  const linesQuery = usePurchaseOrderLines(po.id);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">
                {isDraftPlaceholderNumber(po.number) ? <span className="text-muted-foreground">{t("notYetIssued")}</span> : po.number}
              </CardTitle>
              <Badge variant={PO_STATUS_BADGE_VARIANT[po.status] ?? "outline"}>{tStatuses(po.status)}</Badge>
              {po.revision > 0 && <Badge variant="outline">{t("revisionBadge", { revision: po.revision })}</Badge>}
            </div>
            <CardDescription>{supplierQuery.data?.name ?? po.supplierId}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReceiveGrnDialog po={po} />
            <PoStatusActions po={po} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("requisitionLabel")}</p>
              {po.requisitionId ? (
                <Link href={`/procurement/requisitions/${po.requisitionId}`} className="text-sm text-primary hover:underline">
                  {requisitionQuery.data?.number ?? po.requisitionId}
                </Link>
              ) : (
                <p className="text-sm text-foreground">{t("directPo")}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("quotationLabel")}</p>
              {po.quotationId ? (
                po.requisitionId ? (
                  <Link href={`/procurement/quotations?requisitionId=${po.requisitionId}`} className="text-sm text-primary hover:underline">
                    {t("viewQuotation")}
                  </Link>
                ) : (
                  <p className="text-sm text-foreground">{po.quotationId}</p>
                )
              ) : (
                <p className="text-sm text-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("orderDateLabel")}</p>
              <p className="text-sm text-foreground">{po.orderDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("deliveryTermsLabel")}</p>
              <p className="text-sm text-foreground">{po.deliveryTerms ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paymentTermsDaysLabel")}</p>
              <p className="text-sm text-foreground">{t("paymentTermsDaysValue", { days: po.paymentTermsDays })}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("issuedAtLabel")}</p>
              <p className="text-sm text-foreground">{po.issuedAt ? new Date(po.issuedAt).toLocaleString() : t("notYetIssued")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("subtotalLabel")}</p>
              <p className="text-sm text-foreground">{formatMoney(po.subtotal)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("taxAmountLabel")}</p>
              <p className="text-sm text-foreground">{formatMoney(po.taxAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("totalLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(po.total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(po.supersedesId || supersedingPoQuery.data) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("revisionHistoryTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {po.supersedesId && (
              <Link href={`/procurement/purchase-orders/${po.supersedesId}`} className="flex items-center gap-1.5 text-primary hover:underline">
                <ArrowLeft className="size-3.5" />
                {t("supersedesLink", { number: originalPoQuery.data?.number ?? po.supersedesId })}
              </Link>
            )}
            {supersedingPoQuery.data && (
              <Link href={`/procurement/purchase-orders/${supersedingPoQuery.data.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                <ArrowRight className="size-3.5" />
                {t("supersededByLink", { number: supersedingPoQuery.data.number })}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {!isDraftPlaceholderNumber(po.number) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("grnHistoryTitle")}</CardTitle>
            <CardDescription>{t("grnHistoryDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GrnList poId={po.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
          <CardDescription>{t("linesReceivedHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
            {(lines) => (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("columns.line")}</TableHead>
                      <TableHead>{t("columns.description")}</TableHead>
                      <TableHead>{t("columns.qty")}</TableHead>
                      <TableHead>{t("columns.unitPrice")}</TableHead>
                      <TableHead>{t("columns.receivedQty")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.lineNo}</TableCell>
                        <TableCell>{line.description}</TableCell>
                        <TableCell>{line.qty}</TableCell>
                        <TableCell>{formatMoney(line.unitPrice)}</TableCell>
                        <TableCell>{line.receivedQty}</TableCell>
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

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.purchaseOrders.detail");
  const poQuery = usePurchaseOrder(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/purchase-orders">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={poQuery}>{(po) => <PoDetailBody po={po} />}</QueryBoundary>
    </div>
  );
}
