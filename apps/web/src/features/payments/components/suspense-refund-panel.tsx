"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InstanceStatusBadge } from "@/features/approvals/components/status-badges";
import { useSuspenseRefundInstance } from "../hooks/use-suspense";
import { ExecuteSuspenseRefundDialog } from "./execute-suspense-refund-dialog";
import { RequestSuspenseRefundDialog } from "./request-suspense-refund-dialog";
import type { SuspenseItem } from "../types";

/**
 * Cloned from `receipt-reversal-panel.tsx`, widened from a 2-way split
 * (`pay_receipt.status` is only ever `POSTED`/`REVERSED`) to the real
 * 3-value `PaySuspenseItemState` (`OPEN`/`MATCHED`/`REFUNDED`, confirmed in
 * `pay-suspense-item.entity.ts`'s own `@Check` constraint) — matching, since
 * requesting/executing a refund both require `state === "OPEN"`
 * (`SuspenseService`'s own guard on both `matchToStudent()`/
 * `refundSuspenseItem()`), the SAME reasoning applies to a third real
 * terminal state (`MATCHED`) this domain has that receipts don't.
 *
 * Unlike a receipt (whose `approvalRef` is a structured field on the entity
 * itself), `SuspenseItemResponseDto` has no such field — the refund's
 * approval instance id only ever lives in the free-text `resolutionNote`
 * (confirmed by reading `SuspenseService.refundSuspenseItem()`). This panel
 * resolves the reversal-status query UNCONDITIONALLY (not gated to `OPEN`
 * the way the receipt panel gates it to `POSTED`) so a `REFUNDED` item can
 * still surface a real "View request" link resolved from the live approvals
 * data, not parsed out of that free-text note.
 */
export function SuspenseRefundPanel({ item }: { item: SuspenseItem }) {
  const t = useTranslations("payments.suspense.refund");
  const [refunded, setRefunded] = React.useState<SuspenseItem | null>(null);
  const refundQuery = useSuspenseRefundInstance(item.id);

  const effectiveState = refunded?.state ?? item.state;

  return (
    <div className="space-y-3">
      {refunded && (
        <p className="text-sm text-success">{t("resultDescription")}</p>
      )}

      {effectiveState === "MATCHED" ? (
        <div className="space-y-1 text-sm">
          <p className="text-foreground">{t("matchedLabel")}</p>
          {item.resolvedReceiptId && (
            <Link href={`/payments/receipts/${item.resolvedReceiptId}`} className="text-primary hover:underline">
              {t("viewReceipt")}
            </Link>
          )}
        </div>
      ) : effectiveState === "REFUNDED" ? (
        <div className="space-y-1 text-sm">
          <p className="text-foreground">{t("alreadyRefundedLabel")}</p>
          {refundQuery.latestInstance && (
            <Link href={`/approvals/instances/${refundQuery.latestInstance.id}`} className="text-primary hover:underline">
              {t("viewRequest")}
            </Link>
          )}
        </div>
      ) : (
        <>
          {refundQuery.isLoading && <p className="text-sm text-muted-foreground">{t("statusLoading")}</p>}
          {refundQuery.isError && <p className="text-sm text-muted-foreground">{t("statusLoadFailedHint")}</p>}

          {!refundQuery.isLoading && !refundQuery.isError && (
            <>
              {refundQuery.latestInstance && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("statusLabel")}:</span>
                  <InstanceStatusBadge status={refundQuery.latestInstance.status} />
                  <Link href={`/approvals/instances/${refundQuery.latestInstance.id}`} className="text-primary hover:underline">
                    {t("viewRequest")}
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(!refundQuery.latestInstance ||
                  (refundQuery.latestInstance.status !== "PENDING" && refundQuery.latestInstance.status !== "APPROVED")) && (
                  <RequestSuspenseRefundDialog suspenseItemId={item.id} />
                )}
                {refundQuery.latestInstance?.status === "APPROVED" && (
                  <ExecuteSuspenseRefundDialog suspenseItemId={item.id} refundQuery={refundQuery} onRefunded={setRefunded} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
