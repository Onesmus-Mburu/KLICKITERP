"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenInvoicesTable } from "@/features/billing/components/open-invoices-table";

/**
 * Phase 6 Slice 8 (Part 2) — Pending invoices: every open (`balance>0`,
 * non-VOID) invoice whose `dueDate` is already in the past. Reached from the
 * Billing nav dropdown's new "Pending Invoices" child.
 */
export default function PendingInvoicesPage() {
  const t = useTranslations("billing.pendingInvoices");

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
          <OpenInvoicesTable bucket="PENDING" />
        </CardContent>
      </Card>
    </div>
  );
}
