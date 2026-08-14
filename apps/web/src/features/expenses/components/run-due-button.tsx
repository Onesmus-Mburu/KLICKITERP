"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import type { RunDueResultDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useRunDueTemplates } from "../hooks/use-recurring";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14 — the LAST part of
 * this slice) — **the single most important piece of UI in this whole part**.
 * `recurring.api.ts`'s own doc comment documents WHY: there is no
 * scheduler/cron/worker process anywhere in this codebase that ever calls
 * `POST /expenses/recurring/run-due` automatically — this button, wired to
 * `useRunDueTemplates()`, is the ONLY thing that will ever materialize a due
 * template into a real voucher. It is deliberately rendered as a prominent,
 * top-of-page primary action on the list route (`recurring/page.tsx`), never
 * nested inside a row menu or a secondary tab — a feature this load-bearing
 * doesn't get to hide.
 *
 * Two-step dialog: (1) pick `asOfDate` (defaults to today, editable — useful
 * for testing catch-up scenarios or intentionally running against a past/
 * future date), confirm; (2) a REAL result summary — `RunDueResultDto[]`,
 * one entry per template that actually fired, each linking to both the newly
 * created DRAFT voucher (Part 1's own `/expenses/vouchers/{id}` detail route)
 * and the template itself (`/expenses/recurring/{recurringId}`). An empty
 * result array is rendered as an honest "nothing was due" state, not an
 * error — running with no due templates is a normal, expected outcome.
 *
 * **Explicitly, repeatedly honest that this only ever creates DRAFT
 * vouchers** — `RecurringService.runDue()` never submits/approves/pays
 * anything (confirmed by reading it directly: the created voucher's own
 * `status: "DRAFT"` is hardcoded) — the result panel's own copy states this
 * plainly so nobody mistakes "fired" for "paid."
 */
export function RunDueButton() {
  const t = useTranslations("expenses.recurring.runDue");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [asOfDate, setAsOfDate] = React.useState(todayIso());
  const [results, setResults] = React.useState<RunDueResultDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runDueMutation = useRunDueTemplates();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAsOfDate(todayIso());
      setResults(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    try {
      const fired = await runDueMutation.mutateAsync({ asOfDate });
      setResults(fired);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="lg">
          <PlayCircle className="size-4" />
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

        {results === null && (
          <div className="space-y-1.5">
            <Label>{t("asOfDateLabel")}</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("asOfDateHint")}</p>
          </div>
        )}

        {results !== null && (
          <div className="space-y-3">
            {results.length === 0 ? (
              <Alert>
                <AlertDescription>{t("noneWereDue", { date: asOfDate })}</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">{t("resultSummary", { count: results.length })}</p>
                <p className="text-xs text-muted-foreground">{t("draftOnlyHint")}</p>
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={r.recurringId} className="flex flex-col gap-0.5 rounded-md border border-border p-2 text-sm">
                      <Link href={`/expenses/vouchers/${r.voucherId}`} className="font-medium text-primary hover:underline">
                        {t("viewVoucher")}
                      </Link>
                      <Link href={`/expenses/recurring/${r.recurringId}`} className="text-xs text-muted-foreground hover:underline">
                        {t("viewTemplate")}
                      </Link>
                      <span className="text-xs text-muted-foreground">{t("nextRunOn", { date: r.nextRunOn })}</span>
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
              <Button type="button" onClick={() => void handleRun()} disabled={runDueMutation.isPending || !asOfDate}>
                {runDueMutation.isPending ? t("running") : t("runButton")}
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
