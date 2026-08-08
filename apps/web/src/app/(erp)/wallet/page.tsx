"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletsTable } from "@/features/wallet/components/wallets-table";

/**
 * Phase 6 Slice 11 (Part 2) — the new Wallets list screen. Reached from the
 * new top-level Wallet nav dropdown's "Wallets" child.
 */
export default function WalletsPage() {
  const t = useTranslations("wallet.list");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WalletsTable />
        </CardContent>
      </Card>
    </div>
  );
}
