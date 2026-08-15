"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { BankChequeLeafResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useFlagStaleChequeLeaves } from "../hooks/use-cheque-leaves";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice,
 * and the last "manual trigger standing in for a missing scheduler" of the
 * whole slice) — `POST /banking/cheque-leaves/flag-stale`. **There is no
 * scheduler/cron/worker process anywhere in this codebase that ever calls
 * this route automatically** (confirmed by reading `ChequeLeavesService`'s
 * own class doc comment directly) — this button is the ONLY thing that will
 * ever flip an `ISSUED` leaf sitting unpresented for more than 6 months to
 * `STALE`, the exact same "config/detection logic exists, dispatcher
 * doesn't" gap `RunDueButton` (Expenses, Slice 20 Part 4) already established
 * this project's own precedent for. It is deliberately rendered as a
 * prominent, top-of-page primary action on the global leaves list
 * (`app/(erp)/banking/cheque-leaves/page.tsx`), never nested inside a row
 * menu — a feature this load-bearing doesn't get to hide.
 *
 * One-step confirm dialog (no parameters — `flagStale()` takes none, always
 * evaluates against `now()` server-side) -> a REAL result summary
 * (`BankChequeLeafResponseDto[]`, the leaves actually flagged this run). An
 * empty result is rendered as an honest "nothing was stale" state, not an
 * error — running with nothing to flag is a normal, expected outcome, the
 * same honesty `RunDueButton`'s own `noneWereDue` state already established.
 */
export function FlagStaleButton() {
  const t = useTranslations("banking.chequeLeaves.flagStale");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<BankChequeLeafResponseDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const flagStaleMutation = useFlagStaleChequeLeaves();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResults(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    try {
      const flagged = await flagStaleMutation.mutateAsync();
      setResults(flagged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="lg" variant="outline">
          <AlertTriangle className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results !== null && (
          <div className="space-y-3">
            {results.length === 0 ? (
              <Alert>
                <AlertDescription>{t("noneWereStale")}</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">{t("resultSummary", { count: results.length })}</p>
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {results.map((leaf) => (
                    <li key={leaf.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                      <span>{t("leafRow", { leafNo: leaf.leafNo })}</span>
                      <span className="text-xs text-muted-foreground">{leaf.payee ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {results === null ? (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleRun()} disabled={flagStaleMutation.isPending}>
                {flagStaleMutation.isPending ? t("running") : t("runButton")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setOpen(false)}>
              {tCommon("close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
