"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { RequisitionResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useApproveRequisition, useCancelRequisition, useRejectRequisition, useSubmitRequisition } from "../hooks/use-requisitions";

/** `RequisitionsService.cancel()`'s own real guard — cancel is rejected with a real 422 only from these 3 statuses; every other status (including DRAFT/PENDING_APPROVAL/APPROVED/the never-persisted SUBMITTED) can still be cancelled. */
const CANCEL_BLOCKED_STATUSES = new Set(["CONVERTED", "CANCELLED", "REJECTED"]);

/**
 * Phase 6 Slice 18 Part 2 (Requisitions, Procurement) — one action set per
 * current status: DRAFT gets a direct-click Submit (mirrors
 * `budget-status-actions.tsx`'s own DRAFT treatment — safely retryable, no
 * destructive consequence of its own), PENDING_APPROVAL gets Approve/Reject
 * behind their own confirm dialogs (`RequisitionsController.approve()`/
 * `.reject()` — the same manual-trigger-standing-in-for-a-real-dispatcher
 * pattern `BudgetsController.activate()`/`.reject()` already established,
 * per this module's own controller doc comment), and Cancel is offered
 * whenever the current status isn't one of the 3 genuinely terminal ones —
 * see `CANCEL_BLOCKED_STATUSES` above — including from APPROVED, since
 * nothing in this pass's scope builds the PO-conversion flow that would
 * otherwise consume an APPROVED requisition.
 *
 * **"No approval workflow configured" — handled explicitly, same pattern as
 * Budgets.** `RequisitionsService.submit()` calls
 * `ApprovalEngineService.submit({domainCode: "PROCUREMENT_REQUISITION", ...})`
 * — on an install where nobody has registered a `PROCUREMENT_REQUISITION`
 * `appr_workflow_def`/`appr_workflow_version` yet, that call rejects with a
 * real 422 (`ValidationException`, message `"No active appr_workflow_def
 * registered for domain_code: PROCUREMENT_REQUISITION"`).
 * `handleSubmit()` below checks for that exact substring
 * (`"appr_workflow_def"`) and swaps in an honest, actionable message instead
 * of the raw server string or a generic toast — every OTHER submit failure
 * still falls back to `ApiError.message`/`genericError`. See this slice's
 * PROGRESS.md write-up for whether this was actually observed live against
 * the local dev DB, or whether a workflow happened to already exist (the
 * same live-vs-doc-comment question Slice 17 Part 3 found for `GL_BUDGET`).
 *
 * **Submit is disabled client-side when the requisition has no lines yet** —
 * `RequisitionsService.submit()` rejects a 0-line requisition with its own
 * real 422 (`"has no lines — nothing to submit"`); `hasLines` is threaded
 * down from the detail page (which already queries lines for
 * `<RequisitionLineEditor>`) so this is caught with an explanatory hint
 * instead of a raw error round trip — the server-side guard remains the real
 * source of truth regardless.
 */
export function RequisitionStatusActions({ requisition, hasLines }: { requisition: RequisitionResponseDto; hasLines: boolean }) {
  const t = useTranslations("procurement.requisitions.statusActions");
  const tCommon = useTranslations("common");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const submitMutation = useSubmitRequisition();
  const approveMutation = useApproveRequisition();
  const rejectMutation = useRejectRequisition();
  const cancelMutation = useCancelRequisition();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(requisition.id);
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("appr_workflow_def")) {
        setSubmitError(t("noWorkflowError"));
      } else {
        setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
      }
    }
  }

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await approveMutation.mutateAsync(requisition.id);
      setApproveOpen(false);
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleRejectOpenChange(next: boolean) {
    setRejectOpen(next);
    if (next) setRejectError(null);
  }

  async function handleReject() {
    setRejectError(null);
    try {
      await rejectMutation.mutateAsync(requisition.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleCancelOpenChange(next: boolean) {
    setCancelOpen(next);
    if (next) setCancelError(null);
  }

  async function handleCancel() {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync(requisition.id);
      setCancelOpen(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canCancel = !CANCEL_BLOCKED_STATUSES.has(requisition.status);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {requisition.status === "DRAFT" && (
          <div className="space-y-1">
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending || !hasLines}>
              {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
            </Button>
            {!hasLines && <p className="text-xs text-muted-foreground">{t("submitNeedsLinesHint")}</p>}
          </div>
        )}

        {requisition.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("approveTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription", { number: requisition.number })}</DialogDescription>
                </DialogHeader>
                {approveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{approveError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setApproveOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" onClick={() => void handleApprove()} disabled={approveMutation.isPending}>
                    {approveMutation.isPending ? t("approving") : t("approveConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  {t("rejectTrigger")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("rejectConfirmDescription", { number: requisition.number })}</DialogDescription>
                </DialogHeader>
                {rejectError && (
                  <Alert variant="destructive">
                    <AlertDescription>{rejectError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={rejectMutation.isPending}>
                    {rejectMutation.isPending ? t("rejecting") : t("rejectConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {canCancel && (
          <Dialog open={cancelOpen} onOpenChange={handleCancelOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
                {t("cancelTrigger")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cancelConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("cancelConfirmDescription", { number: requisition.number })}</DialogDescription>
              </DialogHeader>
              {cancelError && (
                <Alert variant="destructive">
                  <AlertDescription>{cancelError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? t("cancelling") : t("cancelConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
