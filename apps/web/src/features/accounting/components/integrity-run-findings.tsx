"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { getPeriod } from "../api/fiscal-years.api";
import { useAccounts } from "../hooks/use-accounts";
import { useCostCenters } from "../hooks/use-cost-centers";
import { parseIntegrityFindings, type IntegrityMismatch, type IntegrityMismatchTotal } from "../lib/integrity-findings";

function useAccountLabels(): Map<string, string> {
  const accountsQuery = useAccounts();
  return React.useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data ?? []) map.set(account.id, `${account.code} — ${account.name}`);
    return map;
  }, [accountsQuery.data]);
}

function useCostCenterLabels(): Map<string, string> {
  const costCentersQuery = useCostCenters();
  return React.useMemo(() => {
    const map = new Map<string, string>();
    for (const costCenter of costCentersQuery.data ?? []) map.set(costCenter.id, `${costCenter.code} — ${costCenter.name}`);
    return map;
  }, [costCentersQuery.data]);
}

/**
 * **Judgment call, documented per the plan's own explicit invitation to make
 * one for this small part**: accounts and cost centers resolve to real
 * `CODE — Name` labels above via `useAccounts()`/`useCostCenters()` (Part 1's
 * own hooks) — both back a single, cheap, already-cached flat list, so
 * building an id→label `Map` from either costs nothing extra beyond what
 * this page would fetch anyway.
 *
 * Periods do NOT get the same treatment. No bulk "list periods across every
 * fiscal year" endpoint exists anywhere on `FiscalYearsController` (confirmed
 * by reading it directly — periods are only ever listed scoped to one
 * already-known fiscal year, the same gap `journal-filters.tsx`'s own doc
 * comment documents), and a mismatch carries only a bare `periodId` with no
 * fiscal-year context to scope such a list by even if one existed. Resolving
 * it therefore means a per-id `GET /accounting/periods/{id}` call — fetched
 * here via `useQueries` (not `usePeriod()` called once per row, which would
 * violate the rules of hooks inside `.map()`), bounded by the number of
 * DISTINCT period ids actually appearing in THIS run's own mismatches (zero
 * on every clean run this slice's own verification expects to see; a real,
 * small, bounded number even on a deliberately-corrupted one — never an
 * unbounded scan). Reuses the exact same query-key shape
 * `use-periods.ts`'s own private `detailKey()` produces
 * (`["accounting","periods","detail",id]`) so this rides that hook's cache
 * instead of creating a parallel one, even though `usePeriod()` itself can't
 * be called here directly.
 */
function usePeriodLabels(periodIds: string[]): Map<string, string> {
  const distinctIds = React.useMemo(() => Array.from(new Set(periodIds)), [periodIds]);
  const results = useQueries({
    queries: distinctIds.map((id) => ({
      queryKey: ["accounting", "periods", "detail", id] as const,
      queryFn: () => getPeriod(id),
    })),
  });
  return React.useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((result, index) => {
      if (result.data) map.set(distinctIds[index], `#${result.data.seq} (${result.data.startsOn} – ${result.data.endsOn})`);
    });
    return map;
  }, [results, distinctIds]);
}

function totalMismatches(stored: IntegrityMismatchTotal | null, derived: IntegrityMismatchTotal | null): { debit: boolean; credit: boolean } {
  return {
    debit: (stored?.debitTotal ?? "0") !== (derived?.debitTotal ?? "0"),
    credit: (stored?.creditTotal ?? "0") !== (derived?.creditTotal ?? "0"),
  };
}

function mismatchRowKey(mismatch: IntegrityMismatch, index: number): string {
  return `${mismatch.periodId}-${mismatch.accountId}-${mismatch.costCenterId ?? "none"}-${index}`;
}

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7) — one run's
 * `findings.mismatches[]`, stored vs. derived debit/credit side by side, the
 * differing amount(s) highlighted in `text-destructive` per cell (not the
 * whole row — a row can mismatch on debit only, credit only, or both, and
 * `Money`-scale decimal-STRING equality is the actual comparison, mirroring
 * `IntegritySweepService.runSweep()`'s own `!derived.equals(stored)` logic,
 * never `parseFloat`).
 *
 * **`parsed === null` is a real, live-confirmed case, not defensive
 * paranoia** — see `../lib/integrity-findings.ts`'s own doc comment: `GET
 * .../runs` can return a `WALLET_RECONCILE` row (Wallet's own sweep, same
 * shared `gl_integrity_run` table) whose `findings` has no `mismatches`
 * array at all. Rather than crash or silently show nothing, this falls back
 * to a raw JSON dump — the same presentation
 * `wallet/reconciliation/page.tsx`'s own `ReconciliationResultCard` already
 * uses for this exact `findings` shape, so a user who expands one of these
 * rows here sees the same honest result they'd see on that module's own
 * screen, not a blank panel or an error.
 */
export function IntegrityRunFindings({ findings }: { findings: object }) {
  const t = useTranslations("accounting.integritySweep.findings");
  const parsed = React.useMemo(() => parseIntegrityFindings(findings), [findings]);
  const accountLabels = useAccountLabels();
  const costCenterLabels = useCostCenterLabels();
  const periodIds = React.useMemo(() => parsed?.mismatches.map((m) => m.periodId) ?? [], [parsed]);
  const periodLabels = usePeriodLabels(periodIds);

  if (!parsed) {
    return (
      <div className="space-y-1.5 px-1 py-2">
        <p className="text-xs text-muted-foreground">{t("unstructuredFindings")}</p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">{JSON.stringify(findings, null, 2)}</pre>
      </div>
    );
  }

  if (parsed.mismatches.length === 0) {
    return <p className="px-1 py-2 text-sm text-muted-foreground">{t("noMismatches")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.period")}</TableHead>
            <TableHead>{t("columns.account")}</TableHead>
            <TableHead>{t("columns.costCenter")}</TableHead>
            <TableHead>{t("columns.storedDebit")}</TableHead>
            <TableHead>{t("columns.derivedDebit")}</TableHead>
            <TableHead>{t("columns.storedCredit")}</TableHead>
            <TableHead>{t("columns.derivedCredit")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parsed.mismatches.map((mismatch, index) => {
            const { debit: debitMismatch, credit: creditMismatch } = totalMismatches(mismatch.stored, mismatch.derived);
            return (
              <TableRow key={mismatchRowKey(mismatch, index)}>
                <TableCell>{periodLabels.get(mismatch.periodId) ?? mismatch.periodId}</TableCell>
                <TableCell>{accountLabels.get(mismatch.accountId) ?? mismatch.accountId}</TableCell>
                <TableCell>{mismatch.costCenterId ? (costCenterLabels.get(mismatch.costCenterId) ?? mismatch.costCenterId) : t("noCostCenter")}</TableCell>
                <TableCell className={cn(debitMismatch && "font-semibold text-destructive")}>
                  {mismatch.stored ? formatMoney(mismatch.stored.debitTotal) : t("missing")}
                </TableCell>
                <TableCell className={cn(debitMismatch && "font-semibold text-destructive")}>
                  {mismatch.derived ? formatMoney(mismatch.derived.debitTotal) : t("missing")}
                </TableCell>
                <TableCell className={cn(creditMismatch && "font-semibold text-destructive")}>
                  {mismatch.stored ? formatMoney(mismatch.stored.creditTotal) : t("missing")}
                </TableCell>
                <TableCell className={cn(creditMismatch && "font-semibold text-destructive")}>
                  {mismatch.derived ? formatMoney(mismatch.derived.creditTotal) : t("missing")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
