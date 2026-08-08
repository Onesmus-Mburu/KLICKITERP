"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenInvoicesTable } from "@/features/billing/components/open-invoices-table";

/**
 * Phase 6 Slice 8 (Part 2) — Upcoming invoices: every open (`balance>0`,
 * non-VOID) invoice whose `dueDate` is today or later. Reached from the
 * Billing nav dropdown's new "Upcoming Invoices" child.
 */
export default function UpcomingInvoicesPage() {
  const t = useTranslations("billing.upcomingInvoices");

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
          <OpenInvoicesTable bucket="UPCOMING" />
        </CardContent>
      </Card>
    </div>
  );
}
