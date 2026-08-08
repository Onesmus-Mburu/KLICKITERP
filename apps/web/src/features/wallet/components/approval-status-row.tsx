"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { InstanceStatusBadge } from "@/features/approvals/components/status-badges";
import type { Instance } from "@/features/approvals/types";

/**
 * Shared status readout for the Transfer/Refund/Adjust panels on the wallet
 * detail page — "is there a pending/decided approval instance for this
 * operation, and has it already been spent" (see `use-wallet-approvals.ts`'s
 * own doc comment on `alreadyExecuted`, the real "no consumed flag exists"
 * finding this reads).
 */
export function WalletApprovalStatusRow({
  latestInstance,
  alreadyExecuted,
}: {
  latestInstance: Instance | null | undefined;
  alreadyExecuted: boolean;
}) {
  const t = useTranslations("wallet.approvalStatus");
  if (!latestInstance) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("label")}:</span>
      <InstanceStatusBadge status={latestInstance.status} />
      {latestInstance.status === "APPROVED" && alreadyExecuted && (
        <span className="text-xs text-success-foreground">{t("completed")}</span>
      )}
      <Link href={`/approvals/instances/${latestInstance.id}`} className="text-primary hover:underline">
        {t("viewRequest")}
      </Link>
    </div>
  );
}
