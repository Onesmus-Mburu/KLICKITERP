"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, isValidDecimalString, sumMoneyStrings } from "@/lib/money";
import { useAssets } from "../hooks/use-assets";
import { useCategories } from "../hooks/use-categories";
import { useDepreciationRunLines } from "../hooks/use-depreciation-runs";

/**
 * Negates a `Money.toDecimalString()`-shaped decimal string — used with
 * `sumMoneyStrings()` below to compute an exact difference (`a + (-b)`)
 * without introducing a second BigInt-arithmetic implementation; `lib/
 * money.ts` has no subtraction helper of its own (only sum), and this file's
 * own need (an equality check, not a real subtraction result to display) is
 * too narrow to justify adding one there.
 */
function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) return trimmed.slice(1);
  if (/^0(\.0+)?$/.test(trimmed)) return trimmed;
  return `-${trimmed}`;
}

/**
 * Whether `nbvAfter` lands exactly on `residualValue` — the honest, real
 * signal that a line was capped by BR-FA-01 (or organically finished its
 * depreciable life this exact period): `depreciation-runs.service.ts`'s own
 * `post()`... no, `createRun()`'s cap math is EXACT, not approximate —
 * `nbvAfter = asset.cost - (asset.accumDepreciation + charge)`, and a capped
 * `charge` is set to EXACTLY `headroom = (cost - residualValue) -
 * accumDepreciation`, so a capped line's `nbvAfter` always equals
 * `residualValue` to the same 4dp scale, never merely "close." The API
 * itself gives no direct "was this capped" flag — this is a real,
 * computable inference from the real returned `amount`/`nbvAfter` figures
 * plus the asset's own `residualValue`, not a guess.
 */
function isAtResidualValue(nbvAfter: string, residualValue: string): boolean {
  if (!isValidDecimalString(nbvAfter) || !isValidDecimalString(residualValue)) return false;
  const diff = sumMoneyStrings([nbvAfter, negateDecimalString(residualValue)]);
  return /^-?0(\.0+)?$/.test(diff);
}

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — `GET
 * .../depreciation-runs/:id/lines`. Renders every computed line for one run,
 * resolving `assetId` to a real code/name (Part 1's own `useAssets()`) and
 * each line's own category (via the resolved asset's `categoryId`, Part 1's
 * own `useCategories()`) — needed since `post()` aggregates one journal PER
 * CATEGORY, not per asset (P-30); the category totals card below previews
 * exactly that grouping.
 *
 * **Label-resolution queries never block this table** — `useAssets()`/
 * `useCategories()` are read separately from the primary lines query and
 * fall back to the raw id per row on 403/404/loading, the same resilience
 * `assets/[id]/page.tsx`'s own `AssetDetailCard` already establishes for its
 * cross-feature label lookups (a role with `fixed-assets:depreciation:run`
 * need not also hold `fixed-assets:asset:view`/`fixed-assets:category:manage`
 * — confirmed by reading all 3 controllers directly, 3 separate permission
 * codes).
 *
 * **The "fully depreciated" badge is a real, honest inference, not a
 * guessed one** — see `isAtResidualValue()`'s own doc comment above for the
 * exact math. Skipped (no badge, not a false negative) whenever the asset's
 * own `residualValue` can't be resolved (label-resolution failure/loading).
 *
 * **No "not computed yet" empty state is needed here, unlike Payroll's own
 * `RunLinesTable`** — `createRun()` computes every line in the SAME call
 * that creates the run (see `depreciation-runs.api.ts`'s own doc comment),
 * so a `DRAFT` run already has real lines (or is legitimately, permanently
 * empty if no asset was eligible that period) from the moment it exists —
 * this table renders unconditionally regardless of `run.status`.
 */
export function DepreciationRunLinesTable({ runId }: { runId: string }) {
  const t = useTranslations("fixedAssets.depreciationRuns.linesTable");
  const linesQuery = useDepreciationRunLines(runId);
  const assetsQuery = useAssets();
  const categoriesQuery = useCategories();

  const assetById = React.useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a])), [assetsQuery.data]);
  const categoryById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])), [categoriesQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryBoundary query={linesQuery} isEmpty={(lines) => lines.length === 0}>
          {(lines) => {
            const rows = [...lines].sort((a, b) => {
              const catA = categoryById.get(assetById.get(a.assetId)?.categoryId ?? "")?.name ?? "";
              const catB = categoryById.get(assetById.get(b.assetId)?.categoryId ?? "")?.name ?? "";
              if (catA !== catB) return catA.localeCompare(catB);
              const codeA = assetById.get(a.assetId)?.code ?? a.assetId;
              const codeB = assetById.get(b.assetId)?.code ?? b.assetId;
              return codeA.localeCompare(codeB);
            });

            const categoryTotals = new Map<string, { label: string; total: string }>();
            for (const line of lines) {
              const asset = assetById.get(line.assetId);
              const key = asset?.categoryId ?? "unknown";
              const label = asset?.categoryId ? (categoryById.get(asset.categoryId)?.name ?? asset.categoryId) : t("unknownCategory");
              const prior = categoryTotals.get(key)?.total ?? "0";
              categoryTotals.set(key, { label, total: sumMoneyStrings([prior, line.amount]) });
            }
            const grandTotal = sumMoneyStrings(lines.map((l) => l.amount));

            return (
              <>
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("columns.category")}</TableHead>
                        <TableHead>{t("columns.asset")}</TableHead>
                        <TableHead>{t("columns.amount")}</TableHead>
                        <TableHead>{t("columns.nbvAfter")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((line) => {
                        const asset = assetById.get(line.assetId);
                        const category = asset?.categoryId ? categoryById.get(asset.categoryId) : undefined;
                        const capped = asset ? isAtResidualValue(line.nbvAfter, asset.residualValue) : false;
                        return (
                          <TableRow key={line.id}>
                            <TableCell>{category?.name ?? (asset?.categoryId ?? "—")}</TableCell>
                            <TableCell>{asset ? `${asset.code} — ${asset.name}` : line.assetId}</TableCell>
                            <TableCell>{formatMoney(line.amount)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{formatMoney(line.nbvAfter)}</span>
                                {capped && <Badge variant="soft-warning">{t("fullyDepreciatedBadge")}</Badge>}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoryTotalsTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("categoryTotalsHint")}</p>
                  <dl className="mt-2 space-y-1">
                    {[...categoryTotals.values()].map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between text-sm">
                        <dt className="text-foreground">{entry.label}</dt>
                        <dd className="font-medium text-foreground">{formatMoney(entry.total)}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
                      <dt className="text-foreground">{t("grandTotalLabel")}</dt>
                      <dd className="text-foreground">{formatMoney(grandTotal)}</dd>
                    </div>
                  </dl>
                </div>
              </>
            );
          }}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
