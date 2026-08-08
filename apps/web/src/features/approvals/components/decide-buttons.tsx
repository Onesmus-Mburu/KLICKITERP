"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Undo2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAuthStore } from "@/lib/auth-store";
import { useDecideInstance } from "../hooks/use-instances";
import type { InstanceDetail } from "../types";

type CommentDecision = "REJECT" | "RETURN";

/**
 * Approve/Reject/Return — a `<Dialog>` for Reject/Return requiring a comment
 * (matching the server's real `FR-APPR-003.1` requirement: the dialog's own
 * `handleSubmit` blocks on an empty/whitespace-only comment BEFORE ever
 * calling the mutation, so the client can never submit without one).
 *
 * Self-approval: `currentUserId` comes from `useAuthStore()` — the already
 * in-memory `PublicUser.id` from login (`lib/auth-store.ts`), the SAME
 * mechanism `nav-links.tsx` reuses for its own coarse gating, not a
 * re-decoded JWT (this app already keeps the logged-in user's real id in
 * the auth store from `POST /auth/login`'s response — no need to decode the
 * access token a second time just to read `sub` back out of it). Buttons are
 * disabled with a clear explanation when `currentUserId ===
 * instance.initiatorId` — a UX nicety mirroring the server's OWN real rule
 * (BR-APPR-01), not itself a security boundary: the server enforces this for
 * real regardless, at three layers (`ApprovalEngineService.decide()`'s own
 * direct check, the delegation-aware "legitimate approver is the initiator"
 * check, and the DB's `trg_appr_no_self_approval` trigger).
 */
export function DecideButtons({ instance }: { instance: InstanceDetail }) {
  const t = useTranslations("approvals.detail.decide");
  const tCommon = useTranslations("common");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const decideMutation = useDecideInstance(instance.id);

  const [dialogDecision, setDialogDecision] = React.useState<CommentDecision | null>(null);
  const [comment, setComment] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [apiError, setApiError] = React.useState<string | null>(null);

  const isPending = instance.status === "PENDING";
  const isSelfInitiated = !!currentUserId && currentUserId === instance.initiatorId;
  const disabled = !isPending || isSelfInitiated || decideMutation.isPending;

  function openDialog(decision: CommentDecision) {
    setDialogDecision(decision);
    setComment("");
    setCommentError(null);
    setApiError(null);
  }

  function handleDialogOpenChange(next: boolean) {
    if (!next) setDialogDecision(null);
  }

  async function handleApprove() {
    setApiError(null);
    try {
      await decideMutation.mutateAsync({ decision: "APPROVE" });
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleDialogSubmit() {
    if (!comment.trim()) {
      setCommentError(t("commentRequired"));
      return;
    }
    setCommentError(null);
    setApiError(null);
    try {
      await decideMutation.mutateAsync({ decision: dialogDecision as CommentDecision, comment: comment.trim() });
      setDialogDecision(null);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (!isPending) {
    return <p className="text-sm text-muted-foreground">{t("notPendingHint")}</p>;
  }

  return (
    <div className="space-y-3">
      {isSelfInitiated && (
        <Alert variant="warning">
          <AlertDescription>{t("selfInitiatedHint")}</AlertDescription>
        </Alert>
      )}

      {apiError && dialogDecision === null && (
        <Alert variant="destructive">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleApprove()} disabled={disabled}>
          <CheckCircle2 className="size-4" />
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:bg-tint-destructive hover:text-destructive"
          onClick={() => openDialog("REJECT")}
          disabled={disabled}
        >
          <XCircle className="size-4" />
          {t("reject")}
        </Button>
        <Button type="button" variant="outline" onClick={() => openDialog("RETURN")} disabled={disabled}>
          <Undo2 className="size-4" />
          {t("return")}
        </Button>
      </div>

      <Dialog open={dialogDecision !== null} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogDecision === "REJECT" ? t("rejectTitle") : t("returnTitle")}</DialogTitle>
            <DialogDescription>{t("commentDescription")}</DialogDescription>
          </DialogHeader>

          {apiError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}
          {commentError && (
            <Alert variant="destructive">
              <AlertDescription>{commentError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label required>{t("commentLabel")}</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} required />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogDecision(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDialogSubmit()} disabled={decideMutation.isPending}>
              {decideMutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
