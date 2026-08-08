"use client";

import { useTranslations } from "next-intl";
import { useWalletRefundApproval } from "../hooks/use-wallet-approvals";
import { WalletApprovalStatusRow } from "./approval-status-row";
import { ExecuteRefundDialog } from "./execute-refund-dialog";
import { RequestRefundDialog } from "./request-refund-dialog";

/** Phase 6 Slice 11 (Part 3) — wallet detail page section for refunds. ALWAYS approval-gated — only ever request-then-execute, never a direct call. */
export function RefundSection({ walletId, studentId }: { walletId: string; studentId: string | undefined }) {
  const t = useTranslations("wallet.refundSection");
  const approval = useWalletRefundApproval(walletId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <RequestRefundDialog walletId={walletId} />
        {approval.latestInstance && approval.latestInstance.status === "APPROVED" && !approval.alreadyExecuted && (
          <ExecuteRefundDialog walletId={walletId} studentId={studentId} instance={approval.latestInstance} />
        )}
      </div>
      <WalletApprovalStatusRow latestInstance={approval.latestInstance} alreadyExecuted={approval.alreadyExecuted} />
    </div>
  );
}
