"use client";

import { useTranslations } from "next-intl";
import { useWalletTransferApproval } from "../hooks/use-wallet-approvals";
import { WalletApprovalStatusRow } from "./approval-status-row";
import { CompleteTransferDialog } from "./complete-transfer-dialog";
import { TransferToFeesDialog } from "./transfer-to-fees-dialog";
import { TransferToWalletDialog } from "./transfer-to-wallet-dialog";

/**
 * Phase 6 Slice 11 (Part 3) — wallet detail page section for both
 * threshold-gated transfer flows. `useWalletTransferApproval()` resolves the
 * ONE shared `WALLET_TRANSFER` approval status both dialogs below share (see
 * `constants.ts`'s doc comment on why transfer-to-fees/transfer-to-wallet
 * can't have independently pending requests) — an APPROVED, not-yet-spent
 * instance surfaces a single "Complete transfer" action here (not duplicated
 * per sub-kind), since `CompleteTransferDialog` itself asks which
 * destination type to finish as.
 */
export function TransferSection({ walletId, studentId }: { walletId: string; studentId: string | undefined }) {
  const t = useTranslations("wallet.transferSection");
  const approval = useWalletTransferApproval(walletId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <TransferToFeesDialog walletId={walletId} studentId={studentId} />
        <TransferToWalletDialog walletId={walletId} studentId={studentId} />
        {approval.latestInstance && approval.latestInstance.status === "APPROVED" && !approval.alreadyExecuted && (
          <CompleteTransferDialog walletId={walletId} studentId={studentId} instance={approval.latestInstance} />
        )}
      </div>
      <WalletApprovalStatusRow latestInstance={approval.latestInstance} alreadyExecuted={approval.alreadyExecuted} />
    </div>
  );
}
