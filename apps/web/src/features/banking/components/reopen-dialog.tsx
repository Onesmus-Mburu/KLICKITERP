"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useReopenReconciliation } from "../hooks/use-reconciliation";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — `POST
 * .../reconciliations/{id}/reopen`. Requires the SEPARATE, more-privileged
 * `banking:reconciliation:reopen` permission (never `banking:reconciliation:manage`
 * alone, confirmed by reading `ReconciliationController.reopen()` directly)
 * — this button/dialog is never hidden client-side based on a guessed
 * permission (no permission-list endpoint exists anywhere in this codebase,
 * the same standing limitation every other status-action component here
 * already documents); a role missing it still sees the trigger, clicks it,
 * and gets a real 403 surfaced via `ApiError.message` in this dialog's own
 * error state.
 *
 * `reason` is required and non-empty, enforced client-side here (trimmed,
 * `canSubmit` false on whitespace-only input) AND server-side
 * (`ReconciliationService.reopen()`'s own `!reason || reason.trim().length
 * === 0` check, a real `ValidationException` if bypassed) — never stored in
 * a dedicated column, it's appended to `outstanding.reopenHistory[]` (a
 * real, persisted jsonb audit trail, see `reconciliation.api.ts`'s own doc
 * comment), which `<ReconciliationLockPanel>` renders once populated.
 *
 * **Only offered from `status === "LOCKED"`** — the caller
 * (`<ReconciliationLockPanel>`) never renders this trigger for
 * `IN_PROGRESS`/`REOPENED` reconciliations; `reopen()` itself rejects
 * anything but `LOCKED` with a real 422 as defense-in-depth regardless.
 */
export function ReopenDialog({ reconciliationId }: { reconciliationId: string }) {
  const t = useTranslations("banking.reconciliations.reopenDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const reopenMutation = useReopenReconciliation();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
    }
  }

  const canSubmit = reason.trim().length > 0 && !reopenMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await reopenMutation.mutateAsync({ id: reconciliationId, dto: { reason: reason.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("deadEndWarning")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reasonLabel")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={3} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {reopenMutation.isPending ? t("reopening") : t("reopenButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
