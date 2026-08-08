"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useCreateWalletForStudent, useWalletByStudent } from "../hooks/use-wallets";
import { WalletStatusBadge } from "./wallet-status-badge";

/**
 * Phase 6 Slice 11 (Part 2) — the student detail page's new Wallet card,
 * same shape as the existing Billing/Receipts cards on
 * `app/(erp)/students/[id]/page.tsx`. `GET wallets/students/:studentId`
 * (`findWalletByStudent()`, already wrapped since Slice 8) returns `null`
 * when no wallet is provisioned yet — shows a "Create wallet" button
 * (`POST wallets/students/:studentId`, get-or-create, newly wrapped this
 * pass as `getOrCreateWalletForStudent()`) in that case; otherwise a compact
 * balance/status summary with a link through to the full detail page.
 */
export function WalletCard({ studentId }: { studentId: string }) {
  const t = useTranslations("students.detail.wallet");
  const walletQuery = useWalletByStudent(studentId);
  const createMutation = useCreateWalletForStudent(studentId);

  return (
    // `isEmpty={() => false}` — `wallet` being `null` (no wallet provisioned
    // yet) is a legitimate, meaningful DATA state this card renders its own
    // "Create wallet" branch for below, not `<QueryBoundary>`'s generic
    // "Nothing here yet" empty panel (whose DEFAULT `isEmpty` treats `null`
    // data as empty — confirmed by reading `defaultIsEmpty()` directly).
    <QueryBoundary query={walletQuery} isEmpty={() => false}>
      {(wallet) =>
        wallet ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("balanceLabel")}</p>
                <p className="text-lg font-semibold text-foreground">{formatMoney(wallet.balance)}</p>
              </div>
              <WalletStatusBadge status={wallet.status} />
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/wallet/${wallet.id}`}>{t("viewWallet")}</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{t("noWallet")}</p>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? t("creating") : t("createButton")}
            </Button>
          </div>
        )
      }
    </QueryBoundary>
  );
}
