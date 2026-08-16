"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Archive, CheckCircle2, Send, Undo2 } from "lucide-react";
import type { FaVerificationResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideVerification, usePostVerification, useSubmitVerification } from "../hooks/use-verifications";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  OPEN: "soft-secondary",
  COUNTING: "soft-primary",
  REVIEW: "soft-accent",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
  CANCELLED: "soft-destructive",
};

/** Reused by both the list page's table and this session's own detail header. */
export function VerificationStatusBadge({ status }: { status: string }) {
  const t = useTranslations("fixedAssets.verificationStatuses");
  return <Badge variant={STATUS_BADGE_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

type ConfirmKind = "submit" | "approve" | "return" | "post" | null;

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — the submit/decide/post
 * button cluster, one shared `ConfirmKind` confirm dialog per
 * `depreciation-run-status-actions.tsx`'s (Part 3) own precedent. `create()`
 * (`create-verification-dialog.tsx`) and `recordCounts()`
 * (`verification-lines-recorder.tsx`) are each their own separate UI
 * surfaces, not buttons on this component — only submit/decide/post live
 * here.
 *
 * **`submit` is shown ONLY when `status === "REVIEW"`** — genuinely
 * different from every lifecycle-action component built so far in this
 * slice: `submitForApproval()` requires every line to have been recorded
 * first (`VerificationService.recordCounts()` auto-progresses
 * `OPEN -> COUNTING -> REVIEW`, confirmed by reading it directly), so
 * Submit staying disabled/hidden through `OPEN`/`COUNTING` isn't a
 * cautious UI guess — it mirrors a real, enforced precondition.
 *
 * **This module's own real `status` enum matches Depreciation Runs'
 * "no persisted Approved state" shape, NOT Disposals'.** `fa_verification.status`
 * is a 6-value enum (`OPEN|COUNTING|REVIEW|PENDING_APPROVAL|POSTED|CANCELLED`)
 * with no dedicated `APPROVED` value — confirmed by reading
 * `onApprovalDecided()` directly (`verification.service.ts:209-225`): the
 * `if (approved) { return verification; }` branch returns the entity
 * completely untouched, the identical shape `depreciation-run-status-
 * actions.tsx`'s own doc comment documents for its own module. **Post is
 * therefore shown throughout the whole `PENDING_APPROVAL` state**, the same
 * "no client-visible signal distinguishes submitted from genuinely approved"
 * reasoning — `post()` itself independently re-verifies the real
 * `ApprovalEngineService.getStatus("fa_verification", id)` server-side and
 * returns a real `ValidationException` (surfaced verbatim here) if it isn't
 * genuinely `APPROVED` yet.
 *
 * **This module's own `decide` endpoint is genuinely insufficient to ever
 * make `post()` succeed on its own — CRITICAL, and unlike every prior
 * part's own finding, this is independently, honestly surfaced in this
 * component's own copy** (`noApprovedStateNotice`/`postMayStillFailNotice`),
 * not just documented in a doc comment: a local APPROVE decision here
 * changes nothing about the real `appr_instance` this session's own
 * `approvalRef` points at (confirmed live — see this slice's own
 * `docs/phase-6/PROGRESS.md` write-up), so a user clicking "Approve" here
 * and then immediately "Post" should expect `post()` to plausibly still
 * fail with a real, verbatim-surfaced error naming the real instance's own
 * current status — this component never claims otherwise.
 *
 * **Post's own confirm copy is deliberately framed as genuinely terminal,
 * not casually reversible** — `POSTED` is `fa_verification`'s own
 * effectively-final state reached by any live code path this pass
 * (`CANCELLED` exists in the enum but no controller route ever sets it) —
 * mirrors `depreciation-run-status-actions.tsx`'s own `postNotReversibleNotice`
 * framing, and additionally states plainly that `post()` has NO GL impact
 * of its own (`journalId` stays `null` forever) — only condition updates on
 * FOUND assets and the missing-asset report, so a user doesn't expect a
 * journal to appear the way Disposals'/Depreciation Runs' own Post does.
 */
export function VerificationStatusActions({ verification }: { verification: FaVerificationResponseDto }) {
  const t = useTranslations("fixedAssets.verifications.actions");
  const tCommon = useTranslations("common");
  const [confirmKind, setConfirmKind] = React.useState<ConfirmKind>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approvedNotice, setApprovedNotice] = React.useState(false);

  const submitMutation = useSubmitVerification();
  const decideMutation = useDecideVerification();
  const postMutation = usePostVerification();

  const isPending = submitMutation.isPending || decideMutation.isPending || postMutation.isPending;

  function openConfirm(kind: ConfirmKind) {
    setConfirmKind(kind);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) setConfirmKind(null);
  }

  async function handleConfirm() {
    if (!confirmKind) return;
    setError(null);
    try {
      if (confirmKind === "submit") {
        await submitMutation.mutateAsync(verification.id);
      } else if (confirmKind === "approve" || confirmKind === "return") {
        await decideMutation.mutateAsync({ id: verification.id, dto: { decision: confirmKind === "approve" ? "APPROVE" : "RETURN" } });
        setApprovedNotice(confirmKind === "approve");
      } else if (confirmKind === "post") {
        await postMutation.mutateAsync(verification.id);
      }
      setConfirmKind(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <>
      {approvedNotice && (
        <Alert variant="success" className="mb-3">
          <AlertDescription>{t("approvedRecordedNotice")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(verification.status === "OPEN" || verification.status === "COUNTING") && (
          <p className="text-sm text-muted-foreground">{t("recordCountsFirstNotice")}</p>
        )}
        {verification.status === "REVIEW" && (
          <Button type="button" onClick={() => openConfirm("submit")}>
            <Send className="size-4" />
            {t("submitTrigger")}
          </Button>
        )}
        {verification.status === "PENDING_APPROVAL" && (
          <>
            <Button type="button" onClick={() => openConfirm("approve")}>
              <CheckCircle2 className="size-4" />
              {t("approveTrigger")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-warning-foreground hover:bg-tint-warning"
              onClick={() => openConfirm("return")}
            >
              <Undo2 className="size-4" />
              {t("returnTrigger")}
            </Button>
            <Button type="button" onClick={() => openConfirm("post")}>
              <Archive className="size-4" />
              {t("postTrigger")}
            </Button>
          </>
        )}
        {verification.status === "POSTED" && <p className="text-sm text-muted-foreground">{t("postedNotice")}</p>}
      </div>

      <Dialog open={confirmKind !== null} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmKind ? t(`${confirmKind}ConfirmTitle`) : ""}</DialogTitle>
            <DialogDescription>{confirmKind ? t(`${confirmKind}ConfirmDescription`) : ""}</DialogDescription>
          </DialogHeader>

          {confirmKind === "approve" && (
            <Alert variant="warning">
              <AlertDescription>{t("noApprovedStateNotice")}</AlertDescription>
            </Alert>
          )}

          {confirmKind === "post" && (
            <Alert variant="warning">
              <AlertDescription>{t("postMayStillFailNotice")}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmKind(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={isPending}>
              {isPending ? t("submitting") : confirmKind ? t(`${confirmKind}ConfirmButton`) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
