"use client";

import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asAhlParams, asNssfParams, asPayeParams, asShifParams, type PyrlStatutoryKind } from "../lib/statutory-params";

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — a kind-aware, human-readable
 * rendering of one row's real `params` (a real formatted PAYE bands table,
 * NSSF's 2 tiers, SHIF's rate+floor, AHL's 2 rates — never a raw JSON dump,
 * per this part's own task brief), used on both the statutory-tables list
 * page (inline, per selected kind) and the detail page.
 *
 * `formatRate()` below multiplies the real stored fraction by 100 purely for
 * DISPLAY text (e.g. `0.06` -> `"0.06 (6%)"`) — this is a one-way,
 * read-only formatting convenience, never round-tripped back into a request
 * body, so it does NOT reintroduce the string-shift-precision concern
 * `lib/percent.ts`'s own doc comment documents for a field that IS
 * round-tripped; a plain `rate * 100` is exact enough for a label a human
 * reads once.
 *
 * Falls back to a raw `<pre>` JSON dump when a row's real `params` doesn't
 * match its own `kind`'s documented shape (the `as*Params()` guards return
 * `null`) — `params` is opaque, DTO-unvalidated jsonb server-side (see
 * `lib/statutory-params.ts`'s own doc comment), so a malformed row is a real
 * possibility this view must not crash on.
 */
export function StatutoryTableParamsView({ kind, params }: { kind: PyrlStatutoryKind; params: Record<string, unknown> }) {
  const t = useTranslations("payroll.statutoryTables.paramsView");

  switch (kind) {
    case "PAYE": {
      const value = asPayeParams(params);
      if (!value) return <RawParamsFallback params={params} note={t("shapeMismatchNote")} />;
      return (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("bandMinLabel")}</TableHead>
                <TableHead>{t("bandMaxLabel")}</TableHead>
                <TableHead>{t("bandRateLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.bands.map((band, i) => (
                <TableRow key={i}>
                  <TableCell>{band.min}</TableCell>
                  <TableCell>{band.max === null ? t("bandMaxUnlimited") : band.max}</TableCell>
                  <TableCell>{formatRate(band.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-foreground">
            {t("personalReliefLabel")}: <span className="font-medium">{value.personalReliefMonthly}</span>
          </p>
        </div>
      );
    }
    case "NSSF": {
      const value = asNssfParams(params);
      if (!value) return <RawParamsFallback params={params} note={t("shapeMismatchNote")} />;
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tier1Label")}</p>
            <p className="text-sm text-foreground">
              {t("tier1UpperLimitLabel")}: <span className="font-medium">{value.tier1.upperLimit}</span>
            </p>
            <p className="text-sm text-foreground">
              {t("rateLabel")}: <span className="font-medium">{formatRate(value.tier1.rate)}</span>
            </p>
          </div>
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tier2Label")}</p>
            <p className="text-sm text-foreground">
              {t("tier2LowerLimitLabel")}: <span className="font-medium">{value.tier2.lowerLimit}</span>
            </p>
            <p className="text-sm text-foreground">
              {t("tier2UpperLimitLabel")}: <span className="font-medium">{value.tier2.upperLimit}</span>
            </p>
            <p className="text-sm text-foreground">
              {t("rateLabel")}: <span className="font-medium">{formatRate(value.tier2.rate)}</span>
            </p>
          </div>
        </div>
      );
    }
    case "SHIF": {
      const value = asShifParams(params);
      if (!value) return <RawParamsFallback params={params} note={t("shapeMismatchNote")} />;
      return (
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            {t("rateLabel")}: <span className="font-medium">{formatRate(value.rate)}</span>
          </p>
          <p className="text-sm text-foreground">
            {t("minimumAmountLabel")}: <span className="font-medium">{value.minimumAmount ?? t("minimumAmountNone")}</span>
          </p>
        </div>
      );
    }
    case "AHL": {
      const value = asAhlParams(params);
      if (!value) return <RawParamsFallback params={params} note={t("shapeMismatchNote")} />;
      return (
        <div className="grid gap-1 sm:grid-cols-2">
          <p className="text-sm text-foreground">
            {t("employeeRateLabel")}: <span className="font-medium">{formatRate(value.employeeRate)}</span>
          </p>
          <p className="text-sm text-foreground">
            {t("employerRateLabel")}: <span className="font-medium">{formatRate(value.employerRate)}</span>
          </p>
        </div>
      );
    }
  }
}

function formatRate(rate: number): string {
  return `${rate} (${rate * 100}%)`;
}

function RawParamsFallback({ params, note }: { params: Record<string, unknown>; note: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-warning-foreground">{note}</p>
      <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs text-foreground">{JSON.stringify(params, null, 2)}</pre>
    </div>
  );
}
