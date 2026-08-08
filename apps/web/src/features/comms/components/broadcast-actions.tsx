"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import type { BroadcastResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useApproveBroadcast, useCancelBroadcast, useSendBroadcast, useSubmitForApproval } from "../hooks/use-broadcasts";

/**
 * Status-contextual action cluster for the broadcast detail page — mirrors
 * `features/approvals/components/decide-buttons.tsx`'s shape (plain buttons,
 * inline `ApiError`-aware error state, disabled-with-reason states based on
 * current status). `DRAFT` shows Submit-for-Approval only; `PENDING_APPROVAL`
 * shows Approve+Cancel; `APPROVED` shows Send+Cancel; `SENDING`/`SENT`/
 * `CANCELLED` show nothing actionable (the status badge on the page itself
 * already says what happened) — per this part's plan.
 *
 * **`submitForApproval`'s `approvalRef` is generated HERE, client-side, via
 * `crypto.randomUUID()`** — not a form field the admin fills in. Per
 * `BroadcastsController.submitForApproval()`'s own doc comment, the real
 * appr_* approval workflow engine is Module 6 (Approvals), not built yet:
 * "this endpoint does not validate or resolve the reference against
 * anything." Any uuid is accepted server-side, so asking an admin to type
 * one in would expose a meaningless internal detail for no reason. The
 * button's real, visible EFFECT — the DRAFT -> PENDING_APPROVAL transition —
 * is completely real and correct; only the specific `approvalRef` VALUE is a
 * placeholder standing in for a workflow engine that doesn't exist yet, so
 * generating it silently is the honest choice, not a hidden gap.
 *
 * No confirm dialog for submit/approve/cancel — mirrors `PublishThemeButton`
 * 's own "reversible-enough, no confirm needed" reasoning (every one of
 * those 3 transitions either isn't destructive, or can be followed by
 * `cancel`). `send` is the ONE genuinely irreversible action in the whole
 * lifecycle (it resolves the real audience and fans out real `comm_message`
 * rows to real recipients) — it gets a plain confirm dialog, the same shape
 * `DeleteTemplateButton` (Part 1) already established. The confirm dialog
 * deliberately does NOT quote `recipientCount` — that field is `0` until
 * `send()` itself resolves the audience (confirmed directly against
 * `BroadcastsService.send()`: `recipientCount` is only set mid-transaction,
 * from the resolved list, never before), so showing it here pre-send would
 * be misleadingly wrong, not just unhelpful.
 */
export function BroadcastActions({ broadcast }: { broadcast: BroadcastResponseDto }) {
  const t = useTranslations("communications.broadcasts.actions");
  const tCommon = useTranslations("common");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmSend, setConfirmSend] = React.useState(false);

  const submitMutation = useSubmitForApproval(broadcast.id);
  const approveMutation = useApproveBroadcast(broadcast.id);
  const cancelMutation = useCancelBroadcast(broadcast.id);
  const sendMutation = useSendBroadcast(broadcast.id);

  const anyPending = submitMutation.isPending || approveMutation.isPending || cancelMutation.isPending || sendMutation.isPending;

  async function handleSubmitForApproval() {
    setError(null);
    try {
      // See this file's own doc comment above for why `approvalRef` is a
      // silently client-generated uuid, not a form field.
      await submitMutation.mutateAsync({ approvalRef: crypto.randomUUID() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleApprove() {
    setError(null);
    try {
      await approveMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleCancel() {
    setError(null);
    try {
      await cancelMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleSend() {
    setError(null);
    try {
      await sendMutation.mutateAsync();
      setConfirmSend(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (broadcast.status === "SENDING" || broadcast.status === "SENT" || broadcast.status === "CANCELLED") {
    return <p className="text-sm text-muted-foreground">{t("noActionsHint")}</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {broadcast.status === "DRAFT" && (
          <Button type="button" onClick={() => void handleSubmitForApproval()} disabled={anyPending}>
            <CheckCircle2 className="size-4" />
            {t("submitForApproval")}
          </Button>
        )}

        {broadcast.status === "PENDING_APPROVAL" && (
          <Button type="button" onClick={() => void handleApprove()} disabled={anyPending}>
            <CheckCircle2 className="size-4" />
            {t("approve")}
          </Button>
        )}

        {broadcast.status === "APPROVED" && (
          <Button type="button" onClick={() => setConfirmSend(true)} disabled={anyPending}>
            <Send className="size-4" />
            {t("send")}
          </Button>
        )}

        {(broadcast.status === "PENDING_APPROVAL" || broadcast.status === "APPROVED") && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-tint-destructive hover:text-destructive"
            onClick={() => void handleCancel()}
            disabled={anyPending}
          >
            <XCircle className="size-4" />
            {t("cancel")}
          </Button>
        )}
      </div>

      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sendConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("sendConfirmDescription")}</DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSend(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleSend()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? t("sending") : t("sendConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
