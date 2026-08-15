"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { UserName } from "@/features/approvals/components/user-name";
import {
  useAcknowledgeReceiver,
  useAcknowledgeSender,
  useApproveDepositOrWithdrawal,
  usePostDepositOrWithdrawal,
  useRejectDepositOrWithdrawal,
  useSubmitDepositOrWithdrawal,
  type DepositWithdrawal,
  type DepositWithdrawalKind,
} from "../hooks/use-deposits-withdrawals";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared status-actions
 * component for BOTH Deposits and Withdrawals, parameterized by `kind` (the
 * same shared-implementation shape `create-deposit-withdrawal-dialog.tsx`
 * already establishes). Two independent sections:
 *
 * 1. **Status actions** — the SAME "confirm dialog per decision,
 *    direct-click submit" shape `transfer-status-actions.tsx` (this part)
 *    already establishes for the identical shared 4-value status enum: DRAFT
 *    gets a direct-click Submit, PENDING_APPROVAL gets Approve/Reject behind
 *    confirm dialogs, APPROVED gets Post behind its own confirm dialog
 *    (noting the real 2-line `1700 Undeposited Funds` journal — see
 *    `deposits-withdrawals.api.ts`'s own "GL posting" doc comment for the
 *    exact, kind-mirrored mechanism). POSTED is terminal — none of the 3
 *    conditions match, nothing renders for this section.
 *
 * 2. **Dual acknowledgment (FR-BANK-007)** — genuinely INDEPENDENT of the
 *    section above: `acknowledgeSender()`/`acknowledgeReceiver()` carry NO
 *    status-transition guard at all server-side (confirmed by reading
 *    `DepositsService`/`WithdrawalsService` directly — every other mutation
 *    on this entity checks `.status` first, these two don't), so both
 *    buttons render UNCONDITIONALLY, regardless of `doc.status` — a DRAFT
 *    deposit can be acknowledged by its receiver before it's even submitted,
 *    and this component reflects that honestly rather than inventing a
 *    status gate the backend doesn't have. Each side shows either an
 *    "Acknowledge as Sender/Receiver" button (not yet acknowledged) or a
 *    resolved `<UserName>` + `new Date(...).toLocaleString()` timestamp
 *    (already acknowledged) — `<UserName>` reuses the Approvals feature's own
 *    id-to-name resolver (`features/approvals/components/user-name.tsx`),
 *    the same "resolve an actor id to a real name, degrade to a raw id on
 *    403/404" precedent already established there, rather than showing a raw
 *    UUID.
 */
export function DepositWithdrawalStatusActions({ doc, kind }: { doc: DepositWithdrawal; kind: DepositWithdrawalKind }) {
  const t = useTranslations(`banking.${kind}s.statusActions`);
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);
  const [ackError, setAckError] = React.useState<string | null>(null);

  const submitMutation = useSubmitDepositOrWithdrawal(kind);
  const approveMutation = useApproveDepositOrWithdrawal(kind);
  const rejectMutation = useRejectDepositOrWithdrawal(kind);
  const postMutation = usePostDepositOrWithdrawal(kind);
  const ackSenderMutation = useAcknowledgeSender(kind);
  const ackReceiverMutation = useAcknowledgeReceiver(kind);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(doc.id);
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
      await approveMutation.mutateAsync(doc.id);
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
      await rejectMutation.mutateAsync(doc.id);
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
      await postMutation.mutateAsync(doc.id);
      setPostOpen(false);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleAckSender() {
    setAckError(null);
    try {
      await ackSenderMutation.mutateAsync(doc.id);
    } catch (err) {
      setAckError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleAckReceiver() {
    setAckError(null);
    try {
      await ackReceiverMutation.mutateAsync(doc.id);
    } catch (err) {
      setAckError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {doc.status === "DRAFT" && (
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
            </Button>
          )}

          {doc.status === "PENDING_APPROVAL" && (
            <>
              <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
                <DialogTrigger asChild>
                  <Button type="button">{t("approveTrigger")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                    <DialogDescription>{t("approveConfirmDescription", { number: doc.number })}</DialogDescription>
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
                    <DialogDescription>{t("rejectConfirmDescription", { number: doc.number })}</DialogDescription>
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

          {doc.status === "APPROVED" && (
            <Dialog open={postOpen} onOpenChange={handlePostOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("postTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("postConfirmDescription", { number: doc.number })}</DialogDescription>
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

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ackSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("ackSenderLabel")}</p>
            {doc.ackBySender ? (
              <p className="text-sm text-foreground">
                <UserName id={doc.ackBySender} /> · {doc.ackBySenderAt ? new Date(doc.ackBySenderAt).toLocaleString() : ""}
              </p>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => void handleAckSender()} disabled={ackSenderMutation.isPending}>
                {ackSenderMutation.isPending ? t("acknowledging") : t("ackSenderTrigger")}
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("ackReceiverLabel")}</p>
            {doc.ackByReceiver ? (
              <p className="text-sm text-foreground">
                <UserName id={doc.ackByReceiver} /> · {doc.ackByReceiverAt ? new Date(doc.ackByReceiverAt).toLocaleString() : ""}
              </p>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => void handleAckReceiver()} disabled={ackReceiverMutation.isPending}>
                {ackReceiverMutation.isPending ? t("acknowledging") : t("ackReceiverTrigger")}
              </Button>
            )}
          </div>
        </div>
        {ackError && (
          <Alert variant="destructive">
            <AlertDescription>{ackError}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
