"use client";

import { useTranslations } from "next-intl";
import { BulkGenerateInvoiceForm } from "@/features/billing/components/bulk-generate-invoice-form";

/**
 * Phase 6 Slice 8 — the bulk "Generate Invoice" screen (category + grade +
 * academic year/term + student-checkbox selection), the new sibling to the
 * existing per-student `GenerateInvoiceDialog` on the student detail page
 * (untouched by this slice). Reached from the new Billing nav dropdown's
 * "Generate Invoice" child (`components/layout/nav-links.tsx`).
 */
export default function BulkGenerateInvoicePage() {
  const t = useTranslations("billing.bulkGenerate");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <BulkGenerateInvoiceForm />
    </div>
  );
}
