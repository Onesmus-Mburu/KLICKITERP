"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReceiptDetailResponseDto, ReceiptResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InstanceStatusBadge } from "@/features/approvals/components/status-badges";
import { useReceiptReversalInstance } from "../hooks/use-receipts";
import { ExecuteReversalDialog } from "./execute-reversal-dialog";
import { RequestReversalDialog } from "./request-reversal-dialog";

/**
 * `pay_receipt.status` only ever has TWO real values (`POSTED`/`REVERSED`,
 * confirmed in `pay-receipt.entity.ts`'s own `@Check` constraint) — so this
 * panel's logic is a plain two-way split, not a bigger state machine:
 *
 * - `REVERSED`: the ORIGINAL receipt already carries `reversalReason`/
 *   `approvalRef` directly on its own row (`ReceiptsService.reverseReceipt()`
 *   sets both on `original` before saving) — no instance query needed at all
 *   to show this state.
 * - `POSTED`: resolve reversal status live via `useReceiptReversalInstance()`
 *   (the plan's own "no per-entity filter endpoint exists" workaround) and
 *   render exactly one of: Request button (no reversal ever requested, or
 *   the latest one was REJECTED/RETURNED/CANCELLED — a fresh request is a
 *   legitimate new attempt, the DB's `uq_appr_instance_open_p` only blocks a
 *   SECOND concurrent PENDING one), a Pending/Rejected/Returned status
 *   indicator with no action (awaiting a decision, or a resolved-but-not-
 *   approved outcome), or an Approved status indicator + Execute button.
 */
export function ReceiptReversalPanel({ receipt }: { receipt: ReceiptDetailResponseDto }) {
  const t = useTranslations("payments.receiptDetail.reversal");
  const [contra, setContra] = React.useState<ReceiptResponseDto | null>(null);
  const reversalQuery = useReceiptReversalInstance(receipt.status === "POSTED" ? receipt.id : undefined);

  return (
    <div className="space-y-3">
      {receipt.reversalOfId && (
        <p className="text-sm text-muted-foreground">
          {t("reversalOfLabel")}{" "}
          <Link href={`/payments/receipts/${receipt.reversalOfId}`} className="text-primary hover:underline">
            {receipt.reversalOfId.slice(0, 8)}…
          </Link>
        </p>
      )}

      {contra && (
        <Alert variant="success">
          <AlertDescription className="space-y-1">
            <p>{t("resultDescription")}</p>
            <Link href={`/payments/receipts/${contra.id}`} className="font-medium text-primary hover:underline">
              {contra.number}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {receipt.status === "REVERSED" ? (
        <div className="space-y-1 text-sm">
          <p className="text-foreground">
            {t("alreadyReversedLabel")}
            {receipt.reversalReason ? ` — ${t(`reasonValues.${receipt.reversalReason}`)}` : ""}
          </p>
          {receipt.approvalRef && (
            <Link href={`/approvals/instances/${receipt.approvalRef}`} className="text-primary hover:underline">
              {t("viewRequest")}
            </Link>
          )}
        </div>
      ) : (
        <>
          {reversalQuery.isLoading && <p className="text-sm text-muted-foreground">{t("statusLoading")}</p>}
          {reversalQuery.isError && <p className="text-sm text-muted-foreground">{t("statusLoadFailedHint")}</p>}

          {!reversalQuery.isLoading && !reversalQuery.isError && (
            <>
              {reversalQuery.latestInstance && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("statusLabel")}:</span>
                  <InstanceStatusBadge status={reversalQuery.latestInstance.status} />
                  <Link href={`/approvals/instances/${reversalQuery.latestInstance.id}`} className="text-primary hover:underline">
                    {t("viewRequest")}
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(!reversalQuery.latestInstance ||
                  (reversalQuery.latestInstance.status !== "PENDING" && reversalQuery.latestInstance.status !== "APPROVED")) && (
                  <RequestReversalDialog receiptId={receipt.id} />
                )}
                {reversalQuery.latestInstance?.status === "APPROVED" && (
                  <ExecuteReversalDialog receiptId={receipt.id} reversalQuery={reversalQuery} onReversed={setContra} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
