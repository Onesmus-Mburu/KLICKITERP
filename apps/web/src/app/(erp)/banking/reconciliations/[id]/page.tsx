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
import { usePeriod } from "@/features/accounting/hooks/use-periods";
import { useReconciliation, type BankReconciliation } from "@/features/banking/hooks/use-reconciliation";
import { AutoMatchPanel } from "@/features/banking/components/auto-match-panel";
import { ReconciliationLockPanel } from "@/features/banking/components/reconciliation-lock-panel";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  IN_PROGRESS: "soft-warning",
  LOCKED: "soft-success",
  REOPENED: "soft-destructive",
};

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — a reconciliation's full
 * workspace: header Card (account + period, resolved to real labels via
 * `useBankAccount()`/`usePeriod()`, status badge, book/bank
 * balance/difference), then EITHER `<AutoMatchPanel>` (while
 * `IN_PROGRESS` — the matching workspace) OR nothing further — the post-lock
 * statement view lives entirely inside `<ReconciliationLockPanel>` below,
 * which itself branches on status (see that component's own doc comment).
 * `<ReconciliationLockPanel>` is ALWAYS rendered (it owns the lock action
 * for `IN_PROGRESS` too, not just the post-lock display).
 */
export default function ReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.reconciliations.detail");
  const reconciliationQuery = useReconciliation(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/reconciliations">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={reconciliationQuery}>{(reconciliation) => <ReconciliationDetailBody reconciliation={reconciliation} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component — its own `useBankAccount()`/`usePeriod()` hook calls need a stable component identity across renders, the same "resolve a foreign id, don't nest the component" discipline `accounts/[id]/page.tsx`'s own `AccountDetailCard` (Part 1) already establishes. */
function ReconciliationDetailBody({ reconciliation }: { reconciliation: BankReconciliation }) {
  const t = useTranslations("banking.reconciliations.detail");
  const tStatuses = useTranslations("banking.reconciliations.statuses");
  const router = useRouter();
  const accountQuery = useBankAccount(reconciliation.accountId);
  const periodQuery = usePeriod(reconciliation.periodId);
  const accountLabel = accountQuery.data ? accountQuery.data.name : reconciliation.accountId;
  const periodLabel = periodQuery.data ? `${periodQuery.data.startsOn} — ${periodQuery.data.endsOn}` : reconciliation.periodId;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{accountLabel}</CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[reconciliation.status] ?? "outline"}>{tStatuses(reconciliation.status)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${reconciliation.accountId}`)}>
              {t("viewAccount")}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bookBalanceLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(reconciliation.bookBalance)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bankBalanceLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(reconciliation.bankBalance)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("differenceLabel")}</p>
              <p className="text-sm font-semibold text-foreground">
                {formatMoney(diffDecimalStrings(reconciliation.bankBalance, reconciliation.bookBalance))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {reconciliation.status === "IN_PROGRESS" && <AutoMatchPanel reconciliation={reconciliation} />}

      <ReconciliationLockPanel reconciliation={reconciliation} />
    </div>
  );
}

/** Plain BigInt-scaled subtraction of two `Money.toDecimalString()`-shaped 4dp values — never `parseFloat`, matching `lib/money.ts`'s own discipline. Both `bookBalance`/`bankBalance` come straight off `Money.toDecimalString()` server-side (`ReconciliationController.toView()`), always at a fixed 4dp scale, so a simple padded-integer subtraction is exact here (unlike `sumMoneyStrings()`'s own general variable-scale case). */
function diffDecimalStrings(a: string, b: string): string {
  const scale = 4;
  const toScaled = (v: string): bigint => {
    const negative = v.trim().startsWith("-");
    const unsigned = negative ? v.trim().slice(1) : v.trim();
    const [intPart = "0", fracPart = ""] = unsigned.split(".");
    const fracPadded = fracPart.padEnd(scale, "0").slice(0, scale);
    const scaled = BigInt(intPart || "0") * 10n ** BigInt(scale) + BigInt(fracPadded || "0");
    return negative ? -scaled : scaled;
  };
  const diff = toScaled(a) - toScaled(b);
  const negative = diff < 0n;
  const abs = negative ? -diff : diff;
  const factor = 10n ** BigInt(scale);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(scale, "0");
  return `${negative && abs !== 0n ? "-" : ""}${intPart}.${fracPart}`;
}
