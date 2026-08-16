"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Archive, Banknote, CheckCircle2, ClipboardCheck, Landmark, Play, RotateCcw, Send, Undo2 } from "lucide-react";
import type { PyrlRunResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useCommitRun, useComputeRun, useDecideRun, useFileRun, useReviewRun, useSubmitRun } from "../hooks/use-payroll-runs";
import { PayRunDialog } from "./pay-run-dialog";

type ConfirmKind = "compute" | "recompute" | "review" | "submit" | "approve" | "return" | "commit" | "file" | null;

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the compute/review/submit/
 * decide button cluster, one file per the task brief's own "your call, split
 * or not" instruction (kept together since all 4 actions share the exact
 * same confirm-dialog shape — a single `ConfirmKind` state drives one shared
 * `<Dialog>` rather than 4 separate ones, less duplication than
 * `LoanDecideActions`' own two-dialog-in-one-file shape needed).
 *
 * **Each action is visible ONLY in the status it's actually valid from** —
 * this component self-gates, the same "callers don't duplicate status
 * logic" discipline `LoanDecideActions`/`RecordRecoveryDialog` already
 * establish for Part 5. Real server-side `ValidationException` messages
 * surface verbatim via `ApiError.message` on a caught 4xx (e.g. attempting
 * `compute()` outside `DRAFT`/`COMPUTED`), never paraphrased — this
 * component's own copy only sets expectations BEFORE a click, it never
 * invents a substitute error message.
 *
 * **`decide(approved: false)` is deliberately labeled "Return to Review,"
 * never "Reject"** — `pyrl_run.status` has no `REJECTED` value at all;
 * `onApprovalDecided()` sends a `false` decision straight back to `REVIEW`
 * (`payroll-runs.service.ts:614-635`), a genuinely resumable state, not a
 * terminal one. The confirm dialog's own copy states this plainly, per the
 * task brief's explicit instruction to frame this honestly (mirroring
 * `LoanDecideActions`' own "Written Off, not Rejected" precedent from Part
 * 5, just for a non-terminal outcome instead of a terminal one this time).
 *
 * **A real, live-verified backend bug found and FIXED this part**:
 * `DecidePyrlRunDto.approved` (`payroll-run.dto.ts`) carried `@ApiProperty()`
 * but NO class-validator decorator at all — with this app's global
 * `ValidationPipe({ whitelist: true })` (`apps/api/src/app.module.ts:198`),
 * `whitelist` strips ANY property lacking at least one validation decorator,
 * even one declared right there on the DTO class. The practical effect,
 * confirmed live before the fix: `POST .../decide` with `{approved: true}`
 * arrived at `onApprovalDecided()` as `approved: undefined` (falsy) on
 * EVERY call, so a payroll run could never actually reach `APPROVED` through
 * the real API — it silently behaved as `approved: false` regardless of what
 * the client sent. Fixed by adding `@IsBoolean()`, matching the sibling
 * `DecidePyrlLoanDto.approved` (Part 5), which already had it correctly.
 * Live-reverified after a `packages/server` rebuild + `apps/api` restart —
 * `decide(approved: true)` now genuinely sets `APPROVED` with a real
 * `approvedBy`. See `docs/phase-6/PROGRESS.md`'s own Part 6 write-up for the
 * full finding.
 *
 * **A second real, live-verified finding, left UNFIXED (out of this part's
 * authorized backend-touch scope) and reflected honestly in
 * `returnNotRejectionNotice`'s own copy**: `onApprovalDecided()` only ever
 * flips `pyrl_run.status` directly — it never calls the real
 * `ApprovalEngineService.decide()` on the underlying `appr_instance`
 * (the same "manual-trigger bypasses the real instance" pattern
 * `LoansService`'s own `decide()` already established for Part 5). For
 * Loans this is harmless (both of ITS own outcomes are terminal), but here
 * `approved: false` returns the RUN to a genuinely resumable `REVIEW` state
 * while the ORIGINAL `appr_instance` stays `PENDING` forever — so a second
 * `submit()` call genuinely fails with a real `409 CONFLICT`
 * (`ApprovalEngineService.submit()`'s own `uq_appr_instance_open_p`
 * one-PENDING-per-entity index), until that stale instance is explicitly
 * resolved via the generic Approvals module's own
 * `POST /approvals/instances/:id/cancel` (self-service for the run's own
 * initiator, confirmed live end-to-end — cancel, then resubmit, succeeds).
 * This screen does not build that cancel action itself (out of this part's
 * own scope) — the real 409 surfaces verbatim via `ApiError.message` if a
 * user hits it, matching this codebase's own "never paraphrase a real
 * error" discipline, and `returnNotRejectionNotice` warns about it
 * up front instead of promising seamless resubmission.
 *
 * **Phase 6 Slice 22 Part 7 completes the lifecycle** — `commit`/`file`
 * reuse this SAME shared `ConfirmKind` dialog (both are pure confirm-only
 * actions on `PayrollRunsController`, no request body of their own), while
 * `pay` opens a SEPARATE `<PayRunDialog>` (own file) since `PayPyrlRunDto`
 * genuinely needs one real input (`method`) the shared dialog has no field
 * for. **`commit`'s own confirm copy is deliberately framed as a real,
 * final, GL-posting action — not casually reversible**: it realizes P-27 in
 * one aggregated journal AND genuinely finalizes every line's loan recovery
 * for real (`LoansService.recordRecovery()`, the first time it's ever
 * called for that line) — `commitConfirmDescription`/`commitNotReversibleNotice`
 * both say so plainly, mirroring `recomputeConfirmDescription`'s own
 * "cannot be undone" framing above but for a genuinely irreversible GL
 * action, not just a same-run wipe-and-rebuild. **`file`'s own confirm copy
 * is equally deliberate about what it does NOT do** — `file()` never
 * generates real P10/NSSF/SHIF/AHL filing documents (a deferred Reporting
 * Engine/Module-18 concern, confirmed by reading `file()`'s own doc comment
 * directly) — `fileConfirmDescription` states this honestly rather than
 * implying a document gets produced. A `FILED` run — the terminal state —
 * renders a plain informational note here instead of any action button,
 * the same "terminal status, no button" shape `APPROVED` used to have here
 * before this part.
 */
export function RunStatusActions({ run }: { run: PyrlRunResponseDto }) {
  const t = useTranslations("payroll.runs.actions");
  const tCommon = useTranslations("common");
  const [confirmKind, setConfirmKind] = React.useState<ConfirmKind>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = React.useState(false);

  const computeMutation = useComputeRun();
  const reviewMutation = useReviewRun();
  const submitMutation = useSubmitRun();
  const decideMutation = useDecideRun();
  const commitMutation = useCommitRun();
  const fileMutation = useFileRun();

  const isPending =
    computeMutation.isPending ||
    reviewMutation.isPending ||
    submitMutation.isPending ||
    decideMutation.isPending ||
    commitMutation.isPending ||
    fileMutation.isPending;

  function openConfirm(kind: ConfirmKind) {
    setConfirmKind(kind);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) setConfirmKind(null);
  }

  async function handleConfirm() {
    if (!confirmKind) return;
    setError(null);
    try {
      if (confirmKind === "compute" || confirmKind === "recompute") {
        await computeMutation.mutateAsync(run.id);
      } else if (confirmKind === "review") {
        await reviewMutation.mutateAsync(run.id);
      } else if (confirmKind === "submit") {
        await submitMutation.mutateAsync(run.id);
      } else if (confirmKind === "approve" || confirmKind === "return") {
        await decideMutation.mutateAsync({ id: run.id, dto: { approved: confirmKind === "approve" } });
      } else if (confirmKind === "commit") {
        await commitMutation.mutateAsync(run.id);
      } else if (confirmKind === "file") {
        await fileMutation.mutateAsync(run.id);
      }
      setConfirmKind(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canCompute = run.status === "DRAFT" || run.status === "COMPUTED";
  const isRecompute = run.status === "COMPUTED";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canCompute && (
          <Button type="button" onClick={() => openConfirm(isRecompute ? "recompute" : "compute")}>
            {isRecompute ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
            {isRecompute ? t("recomputeTrigger") : t("computeTrigger")}
          </Button>
        )}
        {run.status === "COMPUTED" && (
          <Button type="button" variant="outline" onClick={() => openConfirm("review")}>
            <ClipboardCheck className="size-4" />
            {t("reviewTrigger")}
          </Button>
        )}
        {run.status === "REVIEW" && (
          <Button type="button" onClick={() => openConfirm("submit")}>
            <Send className="size-4" />
            {t("submitTrigger")}
          </Button>
        )}
        {run.status === "PENDING_APPROVAL" && (
          <>
            <Button type="button" onClick={() => openConfirm("approve")}>
              <CheckCircle2 className="size-4" />
              {t("approveTrigger")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-warning-foreground hover:bg-tint-warning"
              onClick={() => openConfirm("return")}
            >
              <Undo2 className="size-4" />
              {t("returnTrigger")}
            </Button>
          </>
        )}
        {run.status === "APPROVED" && (
          <Button type="button" onClick={() => openConfirm("commit")}>
            <Landmark className="size-4" />
            {t("commitTrigger")}
          </Button>
        )}
        {run.status === "COMMITTED" && (
          <Button type="button" onClick={() => setPayDialogOpen(true)}>
            <Banknote className="size-4" />
            {t("payTrigger")}
          </Button>
        )}
        {run.status === "PAID" && (
          <Button type="button" onClick={() => openConfirm("file")}>
            <Archive className="size-4" />
            {t("fileTrigger")}
          </Button>
        )}
        {run.status === "FILED" && <p className="text-sm text-muted-foreground">{t("filedNotice")}</p>}
      </div>

      <PayRunDialog runId={run.id} open={payDialogOpen} onOpenChange={setPayDialogOpen} />

      <Dialog open={confirmKind !== null} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmKind ? t(`${confirmKind}ConfirmTitle`) : ""}</DialogTitle>
            <DialogDescription>{confirmKind ? t(`${confirmKind}ConfirmDescription`) : ""}</DialogDescription>
          </DialogHeader>

          {confirmKind === "return" && (
            <Alert variant="warning">
              <AlertDescription>{t("returnNotRejectionNotice")}</AlertDescription>
            </Alert>
          )}

          {confirmKind === "commit" && (
            <Alert variant="warning">
              <AlertDescription>{t("commitNotReversibleNotice")}</AlertDescription>
            </Alert>
          )}

          {confirmKind === "file" && (
            <Alert variant="warning">
              <AlertDescription>{t("fileNoDocumentsNotice")}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmKind(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={isPending}>
              {isPending ? t("submitting") : confirmKind ? t(`${confirmKind}ConfirmButton`) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
