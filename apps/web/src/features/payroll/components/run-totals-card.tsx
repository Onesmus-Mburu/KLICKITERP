"use client";

import { useTranslations } from "next-intl";
import type { PyrlRunResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { asRunTotals } from "../lib/run-totals";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — a real totals summary card
 * built from `PyrlRunResponseDto.totals`, safe-cast via `lib/run-totals.ts`'s
 * own `asRunTotals()` (`Record<string, unknown>` on the wire, genuinely
 * `{}` before this run's first `compute()` call — see that file's own doc
 * comment for why this is `Record<string, unknown>` and not a fixed
 * generated type at all). Renders a dedicated "not computed yet" notice for
 * that real pre-compute state rather than a card full of fabricated zeros.
 */
export function RunTotalsCard({ run }: { run: PyrlRunResponseDto }) {
  const t = useTranslations("payroll.runs.totalsCard");
  const totals = asRunTotals(run.totals);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!totals ? (
          <p className="text-sm text-muted-foreground">{t("notComputedYetNotice")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <TotalField label={t("employeeCountLabel")} value={String(totals.employeeCount)} />
            <TotalField label={t("totalGrossLabel")} value={formatMoney(totals.totalGross)} />
            <TotalField label={t("totalTaxableLabel")} value={formatMoney(totals.totalTaxable)} />
            <TotalField label={t("totalPayeLabel")} value={formatMoney(totals.totalPaye)} />
            <TotalField label={t("totalNssfEmployeeLabel")} value={formatMoney(totals.totalNssfEmployee)} />
            <TotalField label={t("totalNssfEmployerLabel")} value={formatMoney(totals.totalNssfEmployer)} />
            <TotalField label={t("totalShifLabel")} value={formatMoney(totals.totalShif)} />
            <TotalField label={t("totalAhlEmployeeLabel")} value={formatMoney(totals.totalAhlEmployee)} />
            <TotalField label={t("totalAhlEmployerLabel")} value={formatMoney(totals.totalAhlEmployer)} />
            <TotalField label={t("totalLoanRecoveredLabel")} value={formatMoney(totals.totalLoanRecovered)} />
            <TotalField label={t("totalOtherDeductionsLabel")} value={formatMoney(totals.totalOtherDeductions)} />
            <TotalField label={t("totalNetPayLabel")} value={formatMoney(totals.totalNetPay)} className="font-semibold text-foreground" />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function TotalField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={className ?? "text-sm font-medium text-foreground"}>{value}</dd>
    </div>
  );
}
