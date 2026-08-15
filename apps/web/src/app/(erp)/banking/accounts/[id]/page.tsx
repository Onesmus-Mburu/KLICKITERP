"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { BankAccountResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccount as useGlAccount } from "@/features/accounting/hooks/use-accounts";
import { useAccount } from "@/features/banking/hooks/use-accounts";
import { EditAccountDialog } from "@/features/banking/components/edit-account-dialog";

const ACTIVE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  true: "soft-success",
  false: "soft-secondary",
};

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) — a bank
 * account's detail page: header `Card` (name, kind + status badges,
 * `<EditAccountDialog>`) and a details grid (bank name/branch/account
 * number/the linked GL account) — same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `app/(erp)/procurement/suppliers/[id]/page.tsx`
 * (Slice 18 Part 1) already establishes.
 *
 * **`glAccountId` resolved to a human `code — name` label**, not shown as a
 * raw UUID — reuses `features/accounting/hooks/use-accounts.ts`'s own
 * `useAccount()` detail query (Slice 17), the same "resolve a foreign id to
 * its own real name client-side" precedent `expenses/vouchers/page.tsx`'s own
 * payee-resolution/`petty-cash`'s own custodian-resolution already establish.
 * Falls back to the raw id while loading or if resolution somehow fails
 * (403/404 on the GL side), never blocking the bank account's own detail
 * card on that secondary query.
 */
export default function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.accounts.detail");
  const accountQuery = useAccount(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/accounts">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={accountQuery}>{(account) => <AccountDetailCard account={account} />}</QueryBoundary>
    </div>
  );
}

/** A separate, top-level component (not defined inline inside `BankAccountDetailPage`) — its own `useGlAccount()` hook call needs a stable component identity across renders, the same "resolve a foreign id, don't nest the component" discipline every other detail page in this codebase already follows. */
function AccountDetailCard({ account }: { account: BankAccountResponseDto }) {
  const t = useTranslations("banking.accounts.detail");
  const tKinds = useTranslations("banking.kinds");
  const glAccountQuery = useGlAccount(account.glAccountId);
  const glAccountLabel = glAccountQuery.data ? `${glAccountQuery.data.code} — ${glAccountQuery.data.name}` : account.glAccountId;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{account.name}</CardTitle>
            <Badge variant="soft-secondary">{tKinds(account.kind)}</Badge>
            <Badge variant={ACTIVE_BADGE_VARIANT[String(account.isActive)] ?? "outline"}>{account.isActive ? t("active") : t("inactive")}</Badge>
          </div>
        </div>
        <EditAccountDialog account={account} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bankNameLabel")}</p>
            <p className="text-sm text-foreground">{account.bankName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("branchLabel")}</p>
            <p className="text-sm text-foreground">{account.branch ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("accountNoLabel")}</p>
            <p className="text-sm text-foreground">{account.accountNo ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glAccountLabel")}</p>
            <p className="text-sm text-foreground">{glAccountLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
