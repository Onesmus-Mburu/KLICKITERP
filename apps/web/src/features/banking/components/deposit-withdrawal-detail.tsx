"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useAccount as useBankAccount } from "@/features/banking/hooks/use-accounts";
import { isDraftPlaceholderNumber, useDepositOrWithdrawal, type DepositWithdrawal, type DepositWithdrawalKind } from "../hooks/use-deposits-withdrawals";
import { DepositWithdrawalStatusActions } from "./deposit-withdrawal-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared detail body for
 * BOTH `/banking/deposits/[id]` and `/banking/withdrawals/[id]`,
 * parameterized by `kind`. Header Card (number — an honest "Not yet posted"
 * label while it's still the `DRAFT-<uuid>` placeholder, the same treatment
 * `payment-vouchers/[id]/page.tsx` gives its own identical placeholder shape
 * — status badge, `<DepositWithdrawalStatusActions>`), a details grid
 * (account resolved to its own real name via Part 1's own `useAccount()`,
 * amount, slip ref, `sourceSessionId` shown READ-ONLY per the task's own
 * explicit instruction — no picker anywhere in this feature, see
 * `create-deposit-withdrawal-dialog.tsx`'s own doc comment), and a journal
 * link once posted.
 */
export function DepositWithdrawalDetail({ kind }: { kind: DepositWithdrawalKind }) {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations(`banking.${kind}s.detail`);
  const docQuery = useDepositOrWithdrawal(kind, id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/banking/${kind}s`}>
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={docQuery}>{(doc) => <DepositWithdrawalDetailCard doc={doc} kind={kind} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component (not defined inline inside `DepositWithdrawalDetail`) — its own `useBankAccount()` hook call needs a stable component identity across renders, the same "resolve a foreign id, don't nest the component" discipline `accounts/[id]/page.tsx`'s own `AccountDetailCard` (Part 1) already establishes. */
function DepositWithdrawalDetailCard({ doc, kind }: { doc: DepositWithdrawal; kind: DepositWithdrawalKind }) {
  const t = useTranslations(`banking.${kind}s.detail`);
  const tStatuses = useTranslations("banking.statuses");
  const router = useRouter();
  const accountQuery = useBankAccount(doc.accountId);
  const accountLabel = accountQuery.data ? accountQuery.data.name : doc.accountId;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{isDraftPlaceholderNumber(doc.number) ? t("notYetPosted") : doc.number}</CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[doc.status] ?? "outline"}>{tStatuses(doc.status)}</Badge>
            </div>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${doc.accountId}`)}>
              {accountLabel}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(doc.amount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("slipRefLabel")}</p>
              <p className="text-sm text-foreground">{doc.slipRef ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sourceSessionLabel")}</p>
              <p className="text-sm text-foreground" title={doc.sourceSessionId ?? undefined}>
                {doc.sourceSessionId ?? t("noSourceSession")}
              </p>
            </div>
          </div>

          {doc.journalId && (
            <p className="text-sm">
              <Link href={`/accounting/journals/${doc.journalId}`} className="text-primary hover:underline">
                {t("viewJournal")}
              </Link>
            </p>
          )}

          <DepositWithdrawalStatusActions doc={doc} kind={kind} />
        </CardContent>
      </Card>
    </>
  );
}
