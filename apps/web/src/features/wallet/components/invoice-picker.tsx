"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { formatMoney } from "@/lib/money";
import { useStudentInvoices } from "@/features/billing/hooks/use-invoices";

/**
 * Phase 6 Slice 11 (Part 3) — "Needs an invoice-id input (or a picker
 * against the student's own open invoices if that's easy)" per the plan.
 * `useStudentInvoices()` (`features/billing/hooks/use-invoices.ts`) already
 * exists and is reused here verbatim, cross-feature (same reuse discipline
 * `GlAccountSelect`'s own doc comment establishes — no new billing endpoint
 * needed). "Open" here means status is neither `DRAFT` (not yet posted, no
 * real obligation to transfer against) nor `VOID`, AND a real outstanding
 * `balance > 0` — mirrors `PendingUpcomingInvoiceResponseDto`'s own implicit
 * "open" definition (`InvoicesController.pending()`) without needing that
 * narrower list endpoint (which is scoped globally across students, not
 * per-student — `listInvoicesForStudent()` is the right shape here).
 */
export function InvoicePicker({
  studentId,
  value,
  onChange,
  disabled,
}: {
  studentId: string | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wallet.pickers.invoice");
  const query = useStudentInvoices(studentId);

  const items = React.useMemo(
    () =>
      (query.data ?? [])
        .filter((inv) => inv.status !== "DRAFT" && inv.status !== "VOID" && Number(inv.balance) > 0)
        .map((inv) => ({ value: inv.id, label: `${inv.number} — ${formatMoney(inv.balance)} ${t("dueSuffix")}` })),
    [query.data, t],
  );

  return (
    <div className="space-y-1.5">
      <Combobox
        items={items}
        value={value}
        onChange={onChange}
        placeholder={query.isLoading ? t("loading") : t("placeholder")}
        searchPlaceholder={t("searchPlaceholder")}
        emptyText={t("empty")}
        disabled={disabled || query.isLoading}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
