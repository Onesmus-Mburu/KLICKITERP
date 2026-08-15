"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useApproveTransfer, usePostTransfer, useRejectTransfer, useSubmitTransfer, type BankTransferResponseDto } from "../hooks/use-transfers";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — one action set per current
 * status, the same "confirm dialog per decision, direct-click submit" shape
 * `payment-voucher-status-actions.tsx` (Procurement, Slice 18 Part 5) already
 * established: DRAFT gets a direct-click Submit, PENDING_APPROVAL gets
 * Approve/Reject behind confirm dialogs (`TransfersController.approve()`/
 * `.reject()` — manual-trigger stand-ins for a real approval-decision
 * dispatcher, the same interim pattern every other approval-gated entity in
 * this codebase already uses), APPROVED gets Post behind its own confirm
 * dialog. POSTED is terminal — nothing renders (none of the 3 conditions
 * below match), the same "no action row once terminal" shape
 * `inventory/transfer-status-actions.tsx` establishes explicitly.
 *
 * **Post's own confirm dialog notes the real 4-line journal** (P-32,
 * confirmed by reading `BankTransfersService.post()` directly): TWO
 * `TRANSFER_CLEARING` lines (a debit on the source leg, a credit on the
 * destination leg) net to zero BY CONSTRUCTION — same account, opposite
 * sides, same amount — not a separate balance check. The detail page itself
 * (`app/(erp)/banking/transfers/[id]/page.tsx`) carries a fuller, permanent
 * explanation of this mechanism for context even before APPROVED.
 *
 * THREE different permissions gate this controller
 * (`banking:transfer:create` on submit, `:decide` on approve/reject, `:post`
 * on post alone) — none of these buttons are ever hidden client-side based on
 * a guessed permission (no permission-list endpoint exists anywhere in this
 * codebase to check against, the same standing limitation every prior
 * status-actions component in this project already documents); a role
 * missing the right permission still sees the button, clicks it, and gets a
 * real 403 surfaced via `ApiError.message` in this component's own error
 * state.
 */
export function TransferStatusActions({ transfer }: { transfer: BankTransferResponseDto }) {
  const t = useTranslations("banking.transfers.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const submitMutation = useSubmitTransfer();
  const approveMutation = useApproveTransfer();
  const rejectMutation = useRejectTransfer();
  const postMutation = usePostTransfer();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(transfer.id);
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
      await approveMutation.mutateAsync(transfer.id);
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
      await rejectMutation.mutateAsync(transfer.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handlePostOpenChange(next: boolean) {
    setPostOpen(next);
    if (next) setPostError(null);
  }

  async function handlePost() {
    setPostError(null);
    try {
      await postMutation.mutateAsync(transfer.id);
      setPostOpen(false);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {transfer.status === "DRAFT" && (
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {transfer.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("approveTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription", { number: transfer.number })}</DialogDescription>
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
                  <DialogDescription>{t("rejectConfirmDescription", { number: transfer.number })}</DialogDescription>
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

        {transfer.status === "APPROVED" && (
          <Dialog open={postOpen} onOpenChange={handlePostOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("postTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("postConfirmDescription", { number: transfer.number })}</DialogDescription>
              </DialogHeader>
              <Alert variant="warning">
                <AlertDescription>{t("postJournalNote")}</AlertDescription>
              </Alert>
              {postError && (
                <Alert variant="destructive">
                  <AlertDescription>{postError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPostOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handlePost()} disabled={postMutation.isPending}>
                  {postMutation.isPending ? t("posting") : t("postConfirmButton")}
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
