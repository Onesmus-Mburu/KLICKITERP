"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useLockReconciliation, type BankReconciliation } from "../hooks/use-reconciliation";
import { ReopenDialog } from "./reopen-dialog";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — the lock action AND the
 * post-lock statement display, ONE component whose shape changes with
 * `reconciliation.status`, mirroring `DepositWithdrawalStatusActions`'s own
 * "one component, branches on status" shape rather than three separate
 * always-mounted-but-empty components:
 *
 * - `IN_PROGRESS`: a confirm-dialog-gated Lock button (BR-BANK-03,
 *   `POST .../lock`) — matches `PeriodStatusActions`' own "destructive/final
 *   transition gets a confirm dialog" precedent, since locking freezes
 *   further matching/adjustment on this reconciliation.
 * - `LOCKED`: `outstanding` is now a REAL jsonb snapshot —
 *   `{unmatchedStatementLines, unreconciledJournalLines}` (full line detail:
 *   date/amount/description for statement lines, journal id/amount for
 *   journal lines) — THE reconciliation statement FR-BANK-004.1 describes,
 *   and the ONLY point in this whole workflow where a real unmatched-lines
 *   table can be shown (the line-browsing gap `auto-match-panel.tsx`'s own
 *   doc comment documents makes this unavailable at any other point). Also
 *   renders `<ReopenDialog>`.
 * - `REOPENED`: renders the SAME statement (still the last real snapshot
 *   from `lock()` — `reopen()` never clears or recomputes `outstanding`,
 *   confirmed by reading `ReconciliationService.reopen()` directly: it only
 *   ever APPENDS to `reopenHistory`), plus that history, plus an explicit,
 *   honest note that no relock is possible — **confirmed via direct source
 *   read, not assumed**: `ReconciliationService.lock()` only ever accepts
 *   `status === "IN_PROGRESS"`, and no OTHER route on this controller
 *   transitions `REOPENED` back to `IN_PROGRESS` — a `REOPENED`
 *   reconciliation is therefore a genuine dead end through every exposed
 *   route. No "re-lock" button is ever rendered here for this status.
 */
export function ReconciliationLockPanel({ reconciliation }: { reconciliation: BankReconciliation }) {
  const t = useTranslations("banking.reconciliations.lockPanel");

  if (reconciliation.status === "IN_PROGRESS") {
    return <LockAction reconciliation={reconciliation} />;
  }

  const unmatchedStatementLines = reconciliation.outstanding.unmatchedStatementLines ?? [];
  const unreconciledJournalLines = reconciliation.outstanding.unreconciledJournalLines ?? [];
  const reopenHistory = reconciliation.outstanding.reopenHistory ?? [];

  return (
    <div className="space-y-4">
      {reconciliation.status === "REOPENED" && (
        <Alert variant="warning">
          <AlertDescription>{t("reopenedDeadEndNote")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-foreground">{t("statementTitle")}</CardTitle>
            <CardDescription>{t("statementDescription")}</CardDescription>
          </div>
          {reconciliation.status === "LOCKED" && <ReopenDialog reconciliationId={reconciliation.id} />}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              {t("unmatchedStatementLinesTitle", { count: unmatchedStatementLines.length })}
            </h3>
            {unmatchedStatementLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneOutstanding")}</p>
            ) : (
              <ul className="space-y-1.5">
                {unmatchedStatementLines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div>
                      <p className="text-foreground">{line.description ?? t("noDescription")}</p>
                      <p className="text-xs text-muted-foreground">{line.lineDate}</p>
                    </div>
                    <span className="font-medium text-foreground">{formatMoney(line.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              {t("unreconciledJournalLinesTitle", { count: unreconciledJournalLines.length })}
            </h3>
            {unreconciledJournalLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneOutstanding")}</p>
            ) : (
              <ul className="space-y-1.5">
                {unreconciledJournalLines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <span className="text-muted-foreground" title={line.journalId}>
                      {t("journalRef", { id: line.journalId.slice(0, 8) })}
                    </span>
                    <span className="font-medium text-foreground">{formatMoney(line.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {reopenHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("reopenHistoryTitle")}</CardTitle>
            <CardDescription>{t("reopenHistoryDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {reopenHistory.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="space-y-1 rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="soft-warning">{new Date(entry.at).toLocaleString()}</Badge>
                    <span className="text-xs text-muted-foreground" title={entry.actorId}>
                      {t("reopenedBy", { id: entry.actorId.slice(0, 8) })}
                    </span>
                  </div>
                  <p className="text-foreground">{entry.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LockAction({ reconciliation }: { reconciliation: BankReconciliation }) {
  const t = useTranslations("banking.reconciliations.lockPanel");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lockMutation = useLockReconciliation();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleLock() {
    setError(null);
    try {
      await lockMutation.mutateAsync(reconciliation.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("lockTitle")}</CardTitle>
        <CardDescription>{t("lockDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">{t("lockButton")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("lockConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("lockConfirmDescription")}</DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleLock()} disabled={lockMutation.isPending}>
                {lockMutation.isPending ? t("locking") : t("lockConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
