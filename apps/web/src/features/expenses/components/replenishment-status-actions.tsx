"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useApproveReplenishment, useExecuteReplenishment, useRejectReplenishment, type ReplenishmentResponseDto } from "../hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — one action set per
 * current status, mirroring Part 1's own `voucher-status-actions.tsx` shape
 * closely: PENDING_APPROVAL gets Approve/Reject behind confirm dialogs
 * (`PettyCashController.approveReplenishment()`/`.rejectReplenishment()` —
 * the same manual-trigger-standing-in-for-a-real-dispatcher pattern every
 * other approval-gated entity in this codebase already establishes),
 * APPROVED gets Execute behind its own confirm dialog. PAID is terminal —
 * no actions render.
 *
 * **Reject's own confirm dialog is honest about the real deletion** — its
 * description explicitly says the request disappears rather than becoming
 * a "Rejected" row, matching `petty-cash.api.ts`'s own doc comment on
 * `rejectReplenishment()` and the task brief's explicit instruction not to
 * build a REJECTED-badge UI for something the backend doesn't actually keep.
 *
 * **Execute's own confirm dialog is honest that this is the ONLY route that
 * posts GL and moves real money** (P-26) — distinct copy from Approve's own
 * dialog, which is just a decision record with no financial effect yet.
 */
export function ReplenishmentStatusActions({ replenishment }: { replenishment: ReplenishmentResponseDto }) {
  const t = useTranslations("expenses.pettyCash.replenishmentStatusActions");
  const tCommon = useTranslations("common");

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [executeOpen, setExecuteOpen] = React.useState(false);
  const [executeError, setExecuteError] = React.useState<string | null>(null);

  const approveMutation = useApproveReplenishment();
  const rejectMutation = useRejectReplenishment();
  const executeMutation = useExecuteReplenishment();

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await approveMutation.mutateAsync(replenishment.id);
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
      await rejectMutation.mutateAsync(replenishment.id);
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
      await executeMutation.mutateAsync(replenishment.id);
      setExecuteOpen(false);
    } catch (err) {
      setExecuteError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (replenishment.status === "PAID") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {replenishment.status === "PENDING_APPROVAL" && (
        <>
          <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                {t("approveTrigger")}
              </Button>
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
              <Button type="button" variant="outline" size="sm">
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

      {replenishment.status === "APPROVED" && (
        <Dialog open={executeOpen} onOpenChange={handleExecuteOpenChange}>
          <DialogTrigger asChild>
            <Button type="button" size="sm">
              {t("executeTrigger")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("executeConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("executeConfirmDescription")}</DialogDescription>
            </DialogHeader>
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
  );
}
