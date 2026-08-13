"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccountsTree } from "@/features/accounting/hooks/use-accounts";
import { AccountTree } from "@/features/accounting/components/account-tree";
import { CreateAccountDialog } from "@/features/accounting/components/create-account-dialog";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — Chart of
 * Accounts screen: `GET /accounting/accounts/tree` (`accounting:account:view`)
 * rendered as `<AccountTree>`'s recursive expandable hierarchy, a create
 * dialog trigger in the header — direct structural mirror of
 * `app/(erp)/departments/page.tsx` (Card + `<QueryBoundary isEmpty>` +
 * create-dialog trigger), minus the search field (a hierarchy, unlike a flat
 * table, doesn't lend itself to the same client-side substring filter — every
 * account's ancestors would also need to stay visible for the tree shape to
 * make sense, out of scope for this first part).
 */
export default function AccountsPage() {
  const t = useTranslations("accounting.accounts.list");
  const treeQuery = useAccountsTree();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateAccountDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={treeQuery} isEmpty={(d) => d.length === 0}>
            {(nodes) => <AccountTree nodes={nodes} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
