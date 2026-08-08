"use client";

import { useTranslations } from "next-intl";
import { useWalletAdjustmentApproval } from "../hooks/use-wallet-approvals";
import { WalletApprovalStatusRow } from "./approval-status-row";
import { ExecuteAdjustDialog } from "./execute-adjust-dialog";
import { RequestAdjustDialog } from "./request-adjust-dialog";

/** Phase 6 Slice 11 (Part 3) — wallet detail page section for manual adjustments. ALWAYS approval-gated — only ever request-then-execute, never a direct call. */
export function AdjustSection({ walletId, studentId }: { walletId: string; studentId: string | undefined }) {
  const t = useTranslations("wallet.adjustSection");
  const approval = useWalletAdjustmentApproval(walletId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <RequestAdjustDialog walletId={walletId} />
        {approval.latestInstance && approval.latestInstance.status === "APPROVED" && !approval.alreadyExecuted && (
          <ExecuteAdjustDialog walletId={walletId} studentId={studentId} instance={approval.latestInstance} />
        )}
      </div>
      <WalletApprovalStatusRow latestInstance={approval.latestInstance} alreadyExecuted={approval.alreadyExecuted} />
    </div>
  );
}
