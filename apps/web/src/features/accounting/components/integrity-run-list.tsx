"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { cn } from "@/lib/utils";
import { useIntegrityRuns } from "../hooks/use-integrity-sweep";
import { parseIntegrityFindings } from "../lib/integrity-findings";
import { IntegrityRunFindings } from "./integrity-run-findings";

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7) — the run history:
 * `ranAt`/ok-or-not badge/mismatch count, one row per `gl_integrity_run`,
 * newest first (`useIntegrityRuns()`'s own doc comment).
 *
 * **Inline expand, not a `[id]` detail route — settled by what the backend
 * actually exposes, not a stylistic preference.** `IntegritySweepController`
 * has exactly 2 routes total (confirmed by reading it directly): `POST run`
 * and `GET runs`. There is no `GET .../runs/{id}` — every run's full
 * `findings` already arrives inline on `listIntegrityRuns()`'s own response,
 * so a `[id]` page would have nothing of its own to fetch; it would just be
 * this same list, filtered client-side to one row. Given that, and the
 * plan's own "a simple list is probably sufficient given expected low run
 * volume" guidance, this is a plain expand/collapse over rows already in
 * hand — no route, no extra fetch.
 *
 * **This list is NOT scoped to this module's own runs** — confirmed live
 * against the local dev DB, not assumed: `gl_integrity_run` is a table
 * SHARED with Wallet's own reconciliation sweep
 * (`features/wallet/api/reconciliation.api.ts`), and `GET .../runs` has no
 * `kind` filter at all, so a real `WALLET_RECONCILE` row can (and, on this
 * dev DB, does) appear in this same history table. The `kind` column below
 * renders the raw value plainly rather than assuming every row is this
 * module's own `PERIOD_ACCOUNT_TOTAL_RECONCILIATION` — see
 * `../lib/integrity-findings.ts`'s own doc comment for how the mismatch
 * count/findings panel stay crash-safe for a row whose `findings` doesn't
 * match this module's own shape.
 */
export function IntegrityRunList({ highlightRunId }: { highlightRunId?: string | null }) {
  const t = useTranslations("accounting.integritySweep.list");
  const runsQuery = useIntegrityRuns();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Only auto-expand/scroll once the highlighted run genuinely exists in the
  // (post-invalidation) query cache — `onCompleted` fires the moment the
  // mutation resolves, which can race ahead of the list's own refetch, so
  // this waits on `runsQuery.data` rather than firing blind on every
  // `highlightRunId` change.
  React.useEffect(() => {
    if (!highlightRunId) return;
    if (!runsQuery.data?.some((run) => run.id === highlightRunId)) return;
    setExpandedId(highlightRunId);
    document.getElementById(`integrity-run-${highlightRunId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightRunId, runsQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={runsQuery} isEmpty={(d) => d.length === 0}>
          {(runs) => (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t("columns.ranAt")}</TableHead>
                    <TableHead>{t("columns.kind")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead>{t("columns.mismatchCount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const expanded = expandedId === run.id;
                    const findings = parseIntegrityFindings(run.findings);
                    return (
                      <React.Fragment key={run.id}>
                        <TableRow
                          id={`integrity-run-${run.id}`}
                          className="cursor-pointer"
                          onClick={() => setExpandedId(expanded ? null : run.id)}
                        >
                          <TableCell>
                            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                          </TableCell>
                          <TableCell>{new Date(run.ranAt).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{run.kind}</TableCell>
                          <TableCell>
                            <Badge variant={run.ok ? "soft-success" : "soft-destructive"}>{run.ok ? t("ok") : t("mismatchesFound")}</Badge>
                          </TableCell>
                          <TableCell>{findings ? findings.mismatchCount : "—"}</TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/20">
                              <IntegrityRunFindings findings={run.findings} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
