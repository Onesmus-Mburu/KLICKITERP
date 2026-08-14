"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useApproveVoucher, usePayVoucher, useRejectVoucher, useSubmitVoucher, type VoucherResponseDto } from "../hooks/use-vouchers";

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — one action set
 * per current status, mirroring `payment-voucher-status-actions.tsx`'s
 * (Procurement, Slice 18 Part 5) own shape closely: DRAFT gets a direct-click
 * Submit, PENDING_APPROVAL gets Approve/Reject behind confirm dialogs
 * (`VouchersController.approve()`/`.reject()` — the same manual-trigger-
 * standing-in-for-a-real-dispatcher pattern every other approval-gated
 * entity in this codebase already establishes), APPROVED gets Pay behind its
 * own confirm dialog. No Cancel action exists anywhere in this controller —
 * confirmed by reading it directly, a rejection is the only way to reach the
 * terminal CANCELLED state from PENDING_APPROVAL.
 *
 * **BR-EXP-03, surfaced honestly, not duplicated client-side**: `submit()`
 * (`vouchers.api.ts`'s own doc comment) rejects with a real 422 when the
 * voucher's `amount` exceeds the Settings-configurable KES threshold
 * (`expenses.attachment_required_threshold_kes`, default 1000) and it has
 * zero file attachments — there is no file-upload UI anywhere in this part's
 * own scope (per the task brief), so this component never pre-checks
 * anything about attachments client-side. `handleSubmit()` below checks for
 * the exact substring `"BR-EXP-03"` the server's own `ValidationException`
 * message carries (`VouchersService.assertAttachmentRequirement()`) and
 * swaps in an honest, actionable, translated message instead of the raw
 * server string — the same `"appr_workflow_def"`-substring-check pattern
 * `requisition-status-actions.tsx` (Slice 18 Part 2) already established for
 * its own "no approval workflow configured" case. Every OTHER submit
 * failure still falls back to the real `ApiError.message`/a generic error.
 */
export function VoucherStatusActions({ voucher }: { voucher: VoucherResponseDto }) {
  const t = useTranslations("expenses.vouchers.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);

  const submitMutation = useSubmitVoucher();
  const approveMutation = useApproveVoucher();
  const rejectMutation = useRejectVoucher();
  const payMutation = usePayVoucher();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(voucher.id);
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("BR-EXP-03")) {
        setSubmitError(t("attachmentRequiredError"));
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
      await approveMutation.mutateAsync(voucher.id);
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
      await rejectMutation.mutateAsync(voucher.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handlePayOpenChange(next: boolean) {
    setPayOpen(next);
    if (next) setPayError(null);
  }

  async function handlePay() {
    setPayError(null);
    try {
      await payMutation.mutateAsync(voucher.id);
      setPayOpen(false);
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {voucher.status === "DRAFT" && (
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {voucher.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("approveTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription")}</DialogDescription>
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
                  <DialogDescription>{t("rejectConfirmDescription")}</DialogDescription>
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

        {voucher.status === "APPROVED" && (
          <Dialog open={payOpen} onOpenChange={handlePayOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("payTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("payConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("payConfirmDescription")}</DialogDescription>
              </DialogHeader>
              {payError && (
                <Alert variant="destructive">
                  <AlertDescription>{payError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handlePay()} disabled={payMutation.isPending}>
                  {payMutation.isPending ? t("paying") : t("payConfirmButton")}
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
