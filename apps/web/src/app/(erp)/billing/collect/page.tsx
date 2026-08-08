"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CollectFeesFlow } from "@/features/payments/components/collect-fees-flow";

/**
 * Phase 6 Slice 8 (Part 3) — "Collect Fees". Two entry points render THIS
 * one route:
 *  - Bare, from the Billing nav dropdown's new "Collect Fees" child
 *    (`components/layout/nav-links.tsx`) — no query params, student search
 *    starts from scratch.
 *  - Pre-filled, from every Pending/Upcoming invoice row's "Collect" link
 *    (`features/billing/components/open-invoices-table.tsx`, built in the
 *    prior dispatch) — `?studentId=&invoiceId=`, which this route previously
 *    404'd on until this dispatch built it.
 *
 * `useSearchParams()` (client-side), matching this codebase's own existing
 * convention for a dynamic-query-param page — confirmed by reading
 * `app/(erp)/students/[id]/page.tsx`'s `GuardianStatusBanner`, the one other
 * place in this app that reads optional query params on a client page.
 * `useSearchParams()` requires a `<Suspense>` boundary per Next.js App
 * Router's own documented requirement — same reason that file wraps its own
 * search-params reader, so the param-reading piece is split into its own
 * child component here too.
 */
function CollectFeesFlowFromParams() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId") ?? undefined;
  const invoiceId = searchParams.get("invoiceId") ?? undefined;
  return <CollectFeesFlow initialStudentId={studentId} initialInvoiceId={invoiceId} />;
}

export default function CollectFeesPage() {
  const t = useTranslations("payments.collectFees");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <React.Suspense fallback={null}>
        <CollectFeesFlowFromParams />
      </React.Suspense>
    </div>
  );
}
