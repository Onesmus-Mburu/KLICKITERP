"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import type { IntegrityRunResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useRunIntegritySweep } from "../hooks/use-integrity-sweep";

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7) — the one real action
 * this whole page offers: `POST .../run`. No confirm dialog — mirrors
 * `wallet/reconciliation/page.tsx`'s own "Run reconciliation now" direct-click
 * button for the structurally identical Wallet sweep, not
 * `period-status-actions.tsx`'s Hard-Close treatment — this action is
 * read-only against `gl_journal_line`/`gl_period_account_total` and always
 * safe to retry, nothing destructive to confirm.
 *
 * **No toast/notification primitive exists anywhere in this codebase**
 * (confirmed before building this — no `sonner`/toast dependency in
 * `apps/web/package.json`, only the established inline `<Alert>` pattern
 * `budget-status-actions.tsx`/`reverse-journal-dialog.tsx` already use for
 * mutation errors, and `alert.tsx`'s own `success` variant already exists
 * for the confirmation case — e.g. `guardian-link-dialog.tsx`/
 * `student-form.tsx`). The plan's own "success toast" language is therefore
 * implemented as this codebase's real equivalent: an inline
 * `<Alert variant="success">` rendered directly under the button once a
 * clean (`ok: true`) run completes, not a floating/dismissible toast — a
 * deliberate, documented deviation from the literal word "toast," not an
 * oversight.
 *
 * `onCompleted` fires for EVERY completed run (not just mismatched ones) —
 * the caller (`app/(erp)/accounting/integrity-sweep/page.tsx`) uses it to
 * decide whether to scroll/highlight the fresh run's row in the history
 * table below; this component itself owns only the button and its own
 * immediate zero-mismatch confirmation banner, never the history list.
 */
export function RunSweepButton({ onCompleted }: { onCompleted?: (run: IntegrityRunResponseDto) => void }) {
  const t = useTranslations("accounting.integritySweep.runButton");
  const [result, setResult] = React.useState<IntegrityRunResponseDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const runMutation = useRunIntegritySweep();

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      const run = await runMutation.mutateAsync();
      setResult(run.ok ? run : null);
      onCompleted?.(run);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={() => void handleRun()} disabled={runMutation.isPending}>
        <RefreshCw className={runMutation.isPending ? "size-4 animate-spin" : "size-4"} />
        {runMutation.isPending ? t("running") : t("trigger")}
      </Button>

      {result && (
        <Alert variant="success">
          <AlertDescription>{t("noMismatchesFound")}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
