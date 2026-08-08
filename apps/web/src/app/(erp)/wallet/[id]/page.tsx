"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { WalletStatusBadge } from "@/features/wallet/components/wallet-status-badge";
import { TopUpDialog } from "@/features/wallet/components/top-up-dialog";
import { SpendDialog } from "@/features/wallet/components/spend-dialog";
import { SetStatusDialog } from "@/features/wallet/components/set-status-dialog";
import { UpdateLimitsDialog } from "@/features/wallet/components/update-limits-dialog";
import { CloseWalletDialog } from "@/features/wallet/components/close-wallet-dialog";
import { TransactionsTable } from "@/features/wallet/components/transactions-table";
import { TransferSection } from "@/features/wallet/components/transfer-section";
import { RefundSection } from "@/features/wallet/components/refund-section";
import { AdjustSection } from "@/features/wallet/components/adjust-section";
import { useWallet, useWalletTransactions } from "@/features/wallet/hooks/use-wallets";

function LimitStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium text-foreground">{value === null ? "—" : formatMoney(value)}</p>
    </div>
  );
}

/**
 * Phase 6 Slice 11 (Part 2) — the wallet detail page: header card
 * (balance/status/limits + action buttons opening the 5 core-transaction
 * dialogs) and an unpaginated, client-filterable transaction ledger.
 */
export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("wallet.detail");
  const walletQuery = useWallet(id);
  const transactionsQuery = useWalletTransactions(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/wallet">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={walletQuery}>
        {(wallet) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
                  <p className="text-xs text-muted-foreground">{wallet.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TopUpDialog walletId={wallet.id} studentId={wallet.studentId} />
                  <SpendDialog walletId={wallet.id} studentId={wallet.studentId} />
                  <SetStatusDialog walletId={wallet.id} currentStatus={wallet.status} studentId={wallet.studentId} />
                  <UpdateLimitsDialog
                    walletId={wallet.id}
                    currentDailyLimit={wallet.dailyLimit}
                    currentTxnLimit={wallet.txnLimit}
                    currentCategoryBlocks={wallet.categoryBlocks}
                    studentId={wallet.studentId}
                  />
                  <CloseWalletDialog walletId={wallet.id} studentId={wallet.studentId} />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("balanceLabel")}</p>
                  <p className="text-xl font-semibold text-foreground">{formatMoney(wallet.balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("statusLabel")}</p>
                  <WalletStatusBadge status={wallet.status} />
                </div>
                <LimitStat label={t("overdraftLimitLabel")} value={wallet.overdraftLimit} />
                <LimitStat label={t("dailyLimitLabel")} value={wallet.dailyLimit} />
                <LimitStat label={t("txnLimitLabel")} value={wallet.txnLimit} />
                <div>
                  <p className="text-xs text-muted-foreground">{t("categoryBlocksLabel")}</p>
                  <p className="text-sm text-foreground">{wallet.categoryBlocks.length === 0 ? t("noCategoryBlocks") : wallet.categoryBlocks.join(", ")}</p>
                </div>
                {wallet.statusReason && (
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-xs text-muted-foreground">{t("statusReasonLabel")}</p>
                    <p className="text-sm text-foreground">{wallet.statusReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("approvalGated.title")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("approvalGated.description")}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">{t("approvalGated.transferHeading")}</h3>
                  <TransferSection walletId={wallet.id} studentId={wallet.studentId} />
                </div>
                <div className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-sm font-medium text-foreground">{t("approvalGated.refundHeading")}</h3>
                  <RefundSection walletId={wallet.id} studentId={wallet.studentId} />
                </div>
                <div className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-sm font-medium text-foreground">{t("approvalGated.adjustHeading")}</h3>
                  <AdjustSection walletId={wallet.id} studentId={wallet.studentId} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("transactions.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <QueryBoundary query={transactionsQuery} isEmpty={(d) => d.length === 0}>
                  {(transactions) => <TransactionsTable transactions={transactions} />}
                </QueryBoundary>
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
