"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban, CheckCircle2 } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideLoan } from "../hooks/use-loans";

type DecideMode = "approve" | "reject" | null;

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the two real decide actions
 * on a `PENDING_APPROVAL` loan, both going through the same
 * `POST .../decide` endpoint (`DecidePyrlLoanDto: { approved: boolean }`) —
 * a single file, one component, two confirm-only dialogs (no comment field
 * exists on this DTO, unlike the generic approvals engine's own
 * `DecideButtons`, so there is nothing to type — this is a pure
 * confirm/cancel action each way).
 *
 * **The reject path's own copy never says "Rejected" — it says "Written
 * Off," and explains why**: `pyrl_loan.status`'s real DB enum is
 * `PENDING_APPROVAL | ACTIVE | SETTLED | WRITTEN_OFF` — there is genuinely
 * no `REJECTED` value. `decide({approved: false})` moves the loan straight
 * to `WRITTEN_OFF`, the nearest terminal state for an application that never
 * went live (`loans.service.ts:160-166`'s own doc comment names this a
 * deliberate choice). A user who clicks this button and later sees a
 * "Written Off" badge on the loan should never be left wondering whether
 * that's the SAME "Written Off" a genuinely-active-then-written-off loan
 * would show (this controller's own 4 actions never actually produce that
 * second case, but the status value itself doesn't distinguish them) — the
 * dialog below states this plainly before the user commits, so there's no
 * surprise afterward.
 *
 * **The approve path's own copy is equally explicit about its one-shot
 * nature**: `approved: true` activates the loan AND generates its entire
 * amortization schedule in the same call — there is no preview, and no way
 * to undo this by "rejecting" afterward (a loan that's already `ACTIVE` is
 * no longer `PENDING_APPROVAL`, so `decide()` can never be called on it
 * again — confirmed by reading `onApprovalDecided()`'s own guard directly).
 *
 * Only rendered when `loan.status === "PENDING_APPROVAL"` — callers (the
 * loan detail page) are expected to gate this component's visibility
 * themselves, matching every other status-gated action in this feature
 * (`record-recovery-dialog.tsx`/`settle-early-dialog.tsx` do the same for
 * `ACTIVE`).
 */
export function LoanDecideActions({ loan }: { loan: PyrlLoanResponseDto }) {
  const t = useTranslations("payroll.loans.decideDialog");
  const tCommon = useTranslations("common");
  const [mode, setMode] = React.useState<DecideMode>(null);
  const [error, setError] = React.useState<string | null>(null);
  const decideMutation = useDecideLoan();

  function openDialog(next: DecideMode) {
    setMode(next);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) setMode(null);
  }

  async function handleConfirm() {
    if (!mode) return;
    setError(null);
    try {
      await decideMutation.mutateAsync({ id: loan.id, dto: { approved: mode === "approve" } });
      setMode(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (loan.status !== "PENDING_APPROVAL") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => openDialog("approve")}>
          <CheckCircle2 className="size-4" />
          {t("approveTrigger")}
        </Button>
        <Button type="button" variant="outline" className="text-destructive hover:bg-tint-destructive hover:text-destructive" onClick={() => openDialog("reject")}>
          <Ban className="size-4" />
          {t("rejectTrigger")}
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "approve" ? t("approveTitle") : t("rejectTitle")}</DialogTitle>
            <DialogDescription>{mode === "approve" ? t("approveDescription") : t("rejectDescription")}</DialogDescription>
          </DialogHeader>

          {mode === "reject" && (
            <Alert variant="warning">
              <AlertDescription>{t("writtenOffNotice")}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMode(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant={mode === "reject" ? "destructive" : "default"}
              onClick={() => void handleConfirm()}
              disabled={decideMutation.isPending}
            >
              {decideMutation.isPending
                ? t("submitting")
                : mode === "approve"
                  ? t("approveConfirmButton")
                  : t("rejectConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
