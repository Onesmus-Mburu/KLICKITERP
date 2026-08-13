"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import {
  useApprovePaymentVoucher,
  useExecutePaymentVoucher,
  useRejectPaymentVoucher,
  useSubmitPaymentVoucher,
  type PaymentVoucherResponseDto,
} from "../hooks/use-payment-vouchers";

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — one action set per
 * current status, mirroring `po-status-actions.tsx`'s (Part 3) own shape:
 * DRAFT gets a direct-click Submit, PENDING_APPROVAL gets Approve/Reject
 * behind confirm dialogs (`PaymentVouchersController.approve()`/`.reject()`
 * — the same manual-trigger-standing-in-for-a-real-dispatcher pattern every
 * prior part's own approval-gated entity (Requisitions, POs, Budgets)
 * already established), APPROVED gets Execute behind its own confirm
 * dialog.
 *
 * **Execute is gated by a genuinely SEPARATE permission**
 * (`procurement:payment-voucher:execute`, not the `...manage` every other
 * route in this controller shares) — modeled honestly: this button is NEVER
 * hidden client-side based on a guessed role capability (no permission-list
 * endpoint exists anywhere in this codebase to check against, the same
 * standing limitation `create-po-dialog.tsx`'s own
 * `procurement:po:create-direct` doc comment already documents, Part 3). A
 * role that can create/submit/approve a voucher but genuinely lacks
 * `:execute` still sees this same button, clicks it, and gets a REAL 403
 * surfaced via `ApiError.message` in this dialog's own error state — not a
 * silently disabled control pretending to know the answer in advance.
 *
 * **The Execute confirm dialog's own copy notes the underlying-invoice side
 * effect** (`execute()` increments every allocated invoice's `paidAmount`
 * and may flip its `status` to `PARTIALLY_PAID`/`PAID` — see
 * `use-payment-vouchers.ts`'s own `useExecutePaymentVoucher()` doc comment
 * for why that hook also invalidates `SUPPLIER_INVOICES_QUERY_KEY`) — this
 * component does not itself re-fetch/display those invoices' new state
 * beyond that, per the plan's own explicit scope ("a one-line UI note ...
 * you don't need to re-fetch/display invoice state changes here beyond the
 * voucher's own response").
 */
export function PaymentVoucherStatusActions({ voucher }: { voucher: PaymentVoucherResponseDto }) {
  const t = useTranslations("procurement.paymentVouchers.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [executeOpen, setExecuteOpen] = React.useState(false);
  const [executeError, setExecuteError] = React.useState<string | null>(null);

  const submitMutation = useSubmitPaymentVoucher();
  const approveMutation = useApprovePaymentVoucher();
  const rejectMutation = useRejectPaymentVoucher();
  const executeMutation = useExecutePaymentVoucher();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(voucher.id);
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

  function handleExecuteOpenChange(next: boolean) {
    setExecuteOpen(next);
    if (next) setExecuteError(null);
  }

  async function handleExecute() {
    setExecuteError(null);
    try {
      await executeMutation.mutateAsync(voucher.id);
      setExecuteOpen(false);
    } catch (err) {
      setExecuteError(err instanceof ApiError ? err.message : t("genericError"));
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
                  <DialogDescription>{t("approveConfirmDescription", { number: voucher.number })}</DialogDescription>
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
                  <DialogDescription>{t("rejectConfirmDescription", { number: voucher.number })}</DialogDescription>
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
          <Dialog open={executeOpen} onOpenChange={handleExecuteOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("executeTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("executeConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("executeConfirmDescription", { number: voucher.number })}</DialogDescription>
              </DialogHeader>
              <Alert variant="warning">
                <AlertDescription>{t("executeInvoiceEffectNote")}</AlertDescription>
              </Alert>
              {executeError && (
                <Alert variant="destructive">
                  <AlertDescription>{executeError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setExecuteOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handleExecute()} disabled={executeMutation.isPending}>
                  {executeMutation.isPending ? t("executing") : t("executeConfirmButton")}
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
