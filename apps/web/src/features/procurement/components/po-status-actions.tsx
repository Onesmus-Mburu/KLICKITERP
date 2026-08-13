"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { usePurchaseOrder, useApprovePurchaseOrder, useIssuePurchaseOrder, useRejectPurchaseOrder, useSubmitPurchaseOrder, type PurchaseOrder } from "../hooks/use-purchase-orders";
import { RevisePoDialog } from "./revise-po-dialog";

const REVISABLE_STATUSES = new Set(["ISSUED", "PARTIALLY_RECEIVED"]);

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — one action set per
 * current status, mirroring `requisition-status-actions.tsx`'s (Part 2) own
 * shape closely: DRAFT gets a direct-click Submit, PENDING_APPROVAL gets
 * Approve/Reject behind confirm dialogs (`PurchaseOrdersController.approve()`/
 * `.reject()` — the same manual-trigger-standing-in-for-a-real-dispatcher
 * pattern that controller's own doc comment documents), APPROVED gets Issue
 * behind its own confirm dialog, and ISSUED/PARTIALLY_RECEIVED get Revise
 * (`<RevisePoDialog>`). No cancel action exists anywhere — per the task
 * brief, there is no standalone cancel endpoint; cancellation only ever
 * happens as Issue's own side effect on a superseded original, never a
 * direct user action here.
 *
 * **The Issue confirm dialog is the one place in this whole part that surfaces
 * the supersede consequence** — when `po.supersedesId` is set (this PO is a
 * revision), issuing it ALSO auto-cancels the original PO in the same DB
 * transaction (`purchase-orders.api.ts`'s own doc comment on
 * `issuePurchaseOrder()`). The original's own real NUMBER (not just its id)
 * is resolved via `usePurchaseOrder(po.supersedesId)` so the warning reads
 * "Issuing this will cancel PO {number}", never a raw uuid.
 */
export function PoStatusActions({ po }: { po: PurchaseOrder }) {
  const t = useTranslations("procurement.purchaseOrders.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issueError, setIssueError] = React.useState<string | null>(null);

  const submitMutation = useSubmitPurchaseOrder();
  const approveMutation = useApprovePurchaseOrder();
  const rejectMutation = useRejectPurchaseOrder();
  const issueMutation = useIssuePurchaseOrder();

  const originalPoQuery = usePurchaseOrder(po.supersedesId ?? undefined);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(po.id);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await approveMutation.mutateAsync(po.id);
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
      await rejectMutation.mutateAsync(po.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleIssueOpenChange(next: boolean) {
    setIssueOpen(next);
    if (next) setIssueError(null);
  }

  async function handleIssue() {
    setIssueError(null);
    try {
      await issueMutation.mutateAsync({ id: po.id, supersedesId: po.supersedesId });
      setIssueOpen(false);
    } catch (err) {
      setIssueError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {po.status === "DRAFT" && (
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {po.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("approveTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription", { number: po.number })}</DialogDescription>
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
                  <DialogDescription>{t("rejectConfirmDescription", { number: po.number })}</DialogDescription>
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

        {po.status === "APPROVED" && (
          <Dialog open={issueOpen} onOpenChange={handleIssueOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("issueTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("issueConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("issueConfirmDescription")}</DialogDescription>
              </DialogHeader>
              {po.supersedesId && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {originalPoQuery.data ? t("issueSupersedeWarning", { number: originalPoQuery.data.number }) : t("issueSupersedeWarningGeneric")}
                  </AlertDescription>
                </Alert>
              )}
              {issueError && (
                <Alert variant="destructive">
                  <AlertDescription>{issueError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIssueOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handleIssue()} disabled={issueMutation.isPending}>
                  {issueMutation.isPending ? t("issuing") : t("issueConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {REVISABLE_STATUSES.has(po.status) && <RevisePoDialog po={po} />}
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
