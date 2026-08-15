"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import {
  useAutoMatch,
  useManualMatch,
  useReconciliationMatches,
  type AutoMatchResultDto,
  type AutoMatchSuggestionDto,
  type BankReconciliation,
} from "../hooks/use-reconciliation";
import { CreateAdjustmentDialog } from "./create-adjustment-dialog";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — the matching workspace for
 * an `IN_PROGRESS` reconciliation. Built around exactly what `auto-match`'s
 * own response gives (no statement-line browsing endpoint exists anywhere,
 * confirmed by Part 3's own research and reconfirmed by grepping every
 * controller under `packages/server/src/domains/banking/api/` before writing
 * this — 8 controllers total, none list `bank_statement_line` rows), NOT a
 * rich "all unmatched lines" table.
 *
 * **Pass 1/2 vs pass 3, reflected honestly in this UI** (see
 * `reconciliation.api.ts`'s own doc comment for the confirmed mechanism):
 * `pass1Matches`/`pass2Matches` are counts of matches ALREADY APPLIED
 * server-side in the SAME `auto-match` call — rendered here as a plain
 * already-done summary, no action needed. Pass 3's `suggestions` are bare,
 * EPHEMERAL `{statementLineId, journalLineId, amount}` triples (no
 * description/date available — the same API limitation) that exist only in
 * this one response's own React state; each gets its own "Apply this match"
 * button calling `manualMatch()` directly, and is removed from the local
 * list once applied (it becomes a real, persisted match row instead,
 * reflected in the "Matches so far" list below via the shared query-key
 * invalidation `useManualMatch()` already performs).
 *
 * **No blind "manual match" form for arbitrary UUIDs** — a deliberate scope
 * call, not an oversight: the ONLY statement-line/journal-line ids this
 * screen ever legitimately learns about while `IN_PROGRESS` are the ones
 * already surfaced in a pass-3 suggestion row (or a genuinely unbooked
 * charge/interest line, which `<CreateAdjustmentDialog>` handles instead —
 * see that file's own doc comment for the real, documented gap on THAT
 * path). Inventing a free-text "type in two UUIDs" form would invite typos
 * against ids the user has no way to verify from this screen.
 */
export function AutoMatchPanel({ reconciliation }: { reconciliation: BankReconciliation }) {
  const t = useTranslations("banking.reconciliations.autoMatch");
  const matchesQuery = useReconciliationMatches(reconciliation.id);
  const autoMatchMutation = useAutoMatch();
  const manualMatchMutation = useManualMatch();

  const [lastResult, setLastResult] = React.useState<AutoMatchResultDto | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutoMatchSuggestionDto[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [applyErrors, setApplyErrors] = React.useState<Record<string, string>>({});
  const [applyingKey, setApplyingKey] = React.useState<string | null>(null);

  function suggestionKey(s: AutoMatchSuggestionDto) {
    return `${s.statementLineId}:${s.journalLineId}`;
  }

  async function handleRunAutoMatch() {
    setRunError(null);
    try {
      const result = await autoMatchMutation.mutateAsync(reconciliation.id);
      setLastResult(result);
      setSuggestions(result.suggestions);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleApplySuggestion(suggestion: AutoMatchSuggestionDto) {
    const key = suggestionKey(suggestion);
    setApplyingKey(key);
    setApplyErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      await manualMatchMutation.mutateAsync({
        id: reconciliation.id,
        dto: { statementLineId: suggestion.statementLineId, journalLineId: suggestion.journalLineId },
      });
      setSuggestions((prev) => prev.filter((s) => suggestionKey(s) !== key));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("genericError");
      setApplyErrors((prev) => ({ ...prev, [key]: message }));
    } finally {
      setApplyingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void handleRunAutoMatch()} disabled={autoMatchMutation.isPending}>
              {autoMatchMutation.isPending ? t("running") : t("runButton")}
            </Button>
            <CreateAdjustmentDialog reconciliationId={reconciliation.id} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {runError && (
            <Alert variant="destructive">
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          )}

          {lastResult && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Alert variant="success">
                  <AlertDescription>{t("pass1Summary", { count: lastResult.pass1Matches })}</AlertDescription>
                </Alert>
                <Alert variant="success">
                  <AlertDescription>{t("pass2Summary", { count: lastResult.pass2Matches })}</AlertDescription>
                </Alert>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">{t("pass3Title")}</h3>
                <p className="text-xs text-muted-foreground">{t("pass3Description")}</p>
                {suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((s) => {
                      const key = suggestionKey(s);
                      const applyError = applyErrors[key];
                      return (
                        <div key={key} className="space-y-1.5 rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-0.5 text-sm">
                              <p className="text-foreground">
                                {t("suggestionAmount", { amount: formatMoney(s.amount) })}
                              </p>
                              <p className="text-xs text-muted-foreground" title={s.statementLineId}>
                                {t("suggestionStatementLine", { id: s.statementLineId.slice(0, 8) })}
                              </p>
                              <p className="text-xs text-muted-foreground" title={s.journalLineId}>
                                {t("suggestionJournalLine", { id: s.journalLineId.slice(0, 8) })}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleApplySuggestion(s)}
                              disabled={applyingKey === key}
                            >
                              {applyingKey === key ? t("applying") : t("applyButton")}
                            </Button>
                          </div>
                          {applyError && (
                            <Alert variant="destructive">
                              <AlertDescription>{applyError}</AlertDescription>
                            </Alert>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("matchesTitle")}</CardTitle>
          <CardDescription>{t("matchesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={matchesQuery} isEmpty={(d) => d.length === 0}>
            {(matches) => (
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <span className="text-muted-foreground" title={m.statementLineId}>
                      {t("matchStatementLine", { id: m.statementLineId.slice(0, 8) })}
                    </span>
                    {m.adjustmentJournalId ? (
                      <Badge variant="soft-secondary">{t("matchKindAdjustment")}</Badge>
                    ) : (
                      <Badge variant="soft-success">{t("matchKindMatched")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
