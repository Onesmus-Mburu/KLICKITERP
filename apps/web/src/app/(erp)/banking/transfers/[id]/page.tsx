"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { BankTransferResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useAccount as useBankAccount } from "@/features/banking/hooks/use-accounts";
import { isDraftPlaceholderNumber, useTransfer } from "@/features/banking/hooks/use-transfers";
import { TransferStatusActions } from "@/features/banking/components/transfer-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — a transfer's detail page:
 * header Card (number — an honest "Not yet posted" label while it's still
 * the `DRAFT-<uuid>` placeholder, same treatment `payment-vouchers/[id]/page.tsx`
 * gives its own identical placeholder shape — status badge,
 * `<TransferStatusActions>`), a from/to/amount grid (each account resolved
 * to its own real name via Part 1's own `useAccount()`), a journal link once
 * posted, and a PERMANENT "how this posts" note (not gated by status) —
 * P-32's real 4-line journal, confirmed by reading
 * `BankTransfersService.post()` directly: leg 1 debits `TRANSFER_CLEARING` /
 * credits the source account's own GL account, leg 2 debits the destination
 * account's own GL account / credits `TRANSFER_CLEARING` again — the two
 * `TRANSFER_CLEARING` lines net to zero BY CONSTRUCTION (same account,
 * opposite sides, same amount), not a separate balance check.
 */
export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.transfers.detail");
  const transferQuery = useTransfer(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/transfers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={transferQuery}>{(transfer) => <TransferDetailCard transfer={transfer} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component — its own two `useBankAccount()` hook calls need a stable component identity across renders, the same "resolve a foreign id, don't nest the component" discipline `accounts/[id]/page.tsx`'s own `AccountDetailCard` (Part 1) already establishes. */
function TransferDetailCard({ transfer }: { transfer: BankTransferResponseDto }) {
  const t = useTranslations("banking.transfers.detail");
  const tStatuses = useTranslations("banking.statuses");
  const router = useRouter();
  const fromAccountQuery = useBankAccount(transfer.fromAccountId);
  const toAccountQuery = useBankAccount(transfer.toAccountId);
  const fromLabel = fromAccountQuery.data ? fromAccountQuery.data.name : transfer.fromAccountId;
  const toLabel = toAccountQuery.data ? toAccountQuery.data.name : transfer.toAccountId;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{isDraftPlaceholderNumber(transfer.number) ? t("notYetPosted") : transfer.number}</CardTitle>
            <Badge variant={STATUS_BADGE_VARIANT[transfer.status] ?? "outline"}>{tStatuses(transfer.status)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("fromAccountLabel")}</p>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${transfer.fromAccountId}`)}>
              {fromLabel}
            </button>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("toAccountLabel")}</p>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${transfer.toAccountId}`)}>
              {toLabel}
            </button>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(transfer.amount)}</p>
          </div>
        </div>

        {transfer.journalId && (
          <p className="text-sm">
            <Link href={`/accounting/journals/${transfer.journalId}`} className="text-primary hover:underline">
              {t("viewJournal")}
            </Link>
          </p>
        )}

        <Alert>
          <AlertDescription>{t("howThisPostsNote")}</AlertDescription>
        </Alert>

        <TransferStatusActions transfer={transfer} />
      </CardContent>
    </Card>
  );
}
