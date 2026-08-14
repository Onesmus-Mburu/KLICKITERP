"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ClaimResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { CLAIM_METHODS, useApproveClaim, useRejectClaim, useReimburseClaim, useSubmitClaim, type ClaimMethod } from "../hooks/use-claims";

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — one action set per
 * current status, mirroring `voucher-status-actions.tsx`'s (Part 1) own
 * shape closely: DRAFT gets a direct-click Submit, PENDING_APPROVAL gets
 * Approve/Reject behind confirm dialogs (`ClaimsController.approve()`/
 * `.reject()` — the same manual-trigger-standing-in-for-a-real-dispatcher
 * pattern every other approval-gated entity in this codebase already
 * establishes), APPROVED gets Reimburse behind its own confirm dialog.
 * REIMBURSED/REJECTED/CANCELLED are terminal — no actions render (the same
 * `if (status === terminal) return null`-shaped guard `replenishment-status-actions.tsx`,
 * Part 2, already establishes, generalized here to 3 terminal values instead
 * of 1).
 *
 * **Submit is disabled client-side when the claim has no lines yet** — the
 * exact same `hasLines`-threaded-down-from-the-detail-page pattern
 * `requisition-status-actions.tsx` (Procurement, Slice 18 Part 2) already
 * establishes for its own zero-lines guard (`ClaimsService.submit()`'s own
 * real 422, `"has no lines — nothing to submit"`, confirmed by reading it
 * directly) — the server-side guard remains the real source of truth
 * regardless.
 *
 * **Reimburse is THE reason this part exists — the DIRECT-vs-PAYROLL branch,
 * surfaced with real, distinguishing copy, not a one-size-fits-all
 * confirmation**:
 *  - `reimburseVia === "DIRECT"`: shows a REQUIRED method `<Select>` (5
 *    options, `CLAIM_METHODS` — reused from `vouchers.api.ts`'s own
 *    `VOUCHER_METHODS`, see `claims.api.ts`'s own doc comment on why that
 *    reuse is safe here) — the confirm button stays disabled until a method
 *    is chosen, mirroring `claims.api.ts`'s own doc comment that the server
 *    throws a real 422 (`ValidationException`) if `method` is omitted for a
 *    DIRECT claim. The dialog's own description makes clear this pays REAL
 *    cash (debits the category's own expense account(s), credits a
 *    method-resolved clearing account — the same P-25 shape Part 1's own
 *    `payVoucher()` already realizes).
 *  - `reimburseVia === "PAYROLL"`: shows NO method picker AT ALL (not merely
 *    an optional one, per the task brief's explicit instruction) — the
 *    dialog's own description instead states plainly that REIMBURSED here
 *    means "the accrual is booked" (credits `2040 Staff Reimbursements
 *    Payable`), NOT "the staff member has been paid" — the real,
 *    documented naming tension `ClaimsService.reimburse()`'s own class doc
 *    comment (`STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE`) states explicitly;
 *    actual settlement only happens later via a future Module 15 payroll
 *    run, out of this part's own scope.
 */
export function ClaimStatusActions({ claim, hasLines }: { claim: ClaimResponseDto; hasLines: boolean }) {
  const t = useTranslations("expenses.claims.statusActions");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [reimburseOpen, setReimburseOpen] = React.useState(false);
  const [reimburseError, setReimburseError] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<ClaimMethod | "">("");

  const submitMutation = useSubmitClaim();
  const approveMutation = useApproveClaim();
  const rejectMutation = useRejectClaim();
  const reimburseMutation = useReimburseClaim();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(claim.id);
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
      await approveMutation.mutateAsync(claim.id);
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
      await rejectMutation.mutateAsync(claim.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleReimburseOpenChange(next: boolean) {
    setReimburseOpen(next);
    if (next) {
      setReimburseError(null);
      setMethod("");
    }
  }

  const reimburseCanSubmit = claim.reimburseVia === "PAYROLL" || !!method;

  async function handleReimburse() {
    if (!reimburseCanSubmit) return;
    setReimburseError(null);
    try {
      await reimburseMutation.mutateAsync({
        id: claim.id,
        method: claim.reimburseVia === "DIRECT" ? (method as ClaimMethod) : undefined,
      });
      setReimburseOpen(false);
    } catch (err) {
      setReimburseError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (claim.status === "REIMBURSED" || claim.status === "REJECTED" || claim.status === "CANCELLED") return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {claim.status === "DRAFT" && (
          <div className="flex flex-col gap-1">
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending || !hasLines}>
              {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
            </Button>
            {!hasLines && <p className="text-xs text-muted-foreground">{t("noLinesHint")}</p>}
          </div>
        )}

        {claim.status === "PENDING_APPROVAL" && (
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

        {claim.status === "APPROVED" && (
          <Dialog open={reimburseOpen} onOpenChange={handleReimburseOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("reimburseTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("reimburseConfirmTitle")}</DialogTitle>
                <DialogDescription>
                  {claim.reimburseVia === "DIRECT" ? t("reimburseDirectDescription") : t("reimbursePayrollDescription")}
                </DialogDescription>
              </DialogHeader>

              {reimburseError && (
                <Alert variant="destructive">
                  <AlertDescription>{reimburseError}</AlertDescription>
                </Alert>
              )}

              {claim.reimburseVia === "DIRECT" && (
                <div className="space-y-1.5">
                  <Label required>{t("methodLabel")}</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as ClaimMethod)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectMethodPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CLAIM_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {tMethods(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReimburseOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handleReimburse()} disabled={!reimburseCanSubmit || reimburseMutation.isPending}>
                  {reimburseMutation.isPending ? t("reimbursing") : t("reimburseConfirmButton")}
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
