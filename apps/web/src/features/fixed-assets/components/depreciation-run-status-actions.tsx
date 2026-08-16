"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Archive, CheckCircle2, Send, Undo2 } from "lucide-react";
import type { FaDepreciationRunResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideDepreciationRun, usePostDepreciationRun, useSubmitDepreciationRun } from "../hooks/use-depreciation-runs";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
};

/** Reused by both the list page's table and this run's own detail header. */
export function DepreciationRunStatusBadge({ status }: { status: string }) {
  const t = useTranslations("fixedAssets.depreciationRunStatuses");
  return <Badge variant={STATUS_BADGE_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

type ConfirmKind = "submit" | "approve" | "return" | "post" | null;

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — the submit/decide/post
 * button cluster, one shared `ConfirmKind` confirm dialog per
 * `run-status-actions.tsx`'s own precedent (Payroll Slice 22 Part 6). Only 3
 * mutations here, not 4 — `create()` (which also computes) is this module's
 * own separate dialog (`create-depreciation-run-dialog.tsx`), not a button on
 * this already-existing run's own detail page.
 *
 * **Each action is visible ONLY in the status it's actually valid from** —
 * `DRAFT` shows Submit; `PENDING_APPROVAL` shows Approve/Return AND Post
 * together (see below for why Post isn't gated any tighter); `POSTED` shows
 * a plain terminal notice, no buttons. Real server-side
 * `ValidationException` messages surface verbatim via `ApiError.message` on
 * a caught 4xx, never paraphrased.
 *
 * **Post is shown throughout `PENDING_APPROVAL`, not gated on "has this run
 * actually been approved yet"** — a deliberate, documented judgment call:
 * `fa_depreciation_run.status` never gains a real `APPROVED` value (see
 * below), so there is no client-visible signal at all that distinguishes
 * "submitted, awaiting decision" from "approved, awaiting posting" without a
 * SEPARATE call into the generic Approvals module to read the real
 * `appr_instance.status` — out of this part's own scope (no such
 * cross-module read hook exists yet, and building one is a bigger surface
 * than this part's own time budget covers). `post()` itself independently
 * re-verifies the real approval status server-side and returns a clean,
 * real `ValidationException` (surfaced verbatim here) if it isn't genuinely
 * `APPROVED` yet — the same "never guess, let the real error speak"
 * discipline this codebase already applies to every other under-specified
 * permission/state edge case.
 *
 * **`decide(APPROVE)` never changes this run's own persisted `status` — a
 * real, confirmed enum shape, not a bug**: `fa_depreciation_run.status` is a
 * 3-value enum (`DRAFT|PENDING_APPROVAL|POSTED`, confirmed by reading
 * `FaDepreciationRunEntity`/`onApprovalDecided()` directly) with NO
 * dedicated `APPROVED` value at all. After a real APPROVE decision, this
 * run's own status stays `PENDING_APPROVAL` in the database — this
 * component NEVER optimistically flips any local/badge state to an
 * "Approved" appearance that doesn't exist in the real enum. Instead, on a
 * successful APPROVE, a TRANSIENT `<Alert variant="success">` confirms the
 * decision was recorded (this codebase has no toast/notification primitive
 * anywhere, confirmed before building this — the same real, documented
 * deviation `run-sweep-button.tsx`'s own doc comment already establishes),
 * while the status badge shown elsewhere on this page keeps reading directly
 * off the refetched `run.status` — genuinely still `PENDING_APPROVAL`. A
 * RETURN decision, by contrast, IS a real persisted change — it reverts
 * `status` to `DRAFT` — confirmed by reading `onApprovalDecided()` directly,
 * not assumed to match Payroll's own "back to REVIEW" shape (this module's
 * own lifecycle is shorter and has no REVIEW state at all).
 *
 * **Post's own confirm copy is deliberately framed as genuinely terminal,
 * not casually reversible** — `POSTED` is `fa_depreciation_run`'s own final
 * state (the enum ends there); `trg_fa_depreciation_run_immutable` rejects
 * ANY further column change unconditionally once posted, including a no-op
 * re-set of the same status. `postNotReversibleNotice` says so plainly,
 * mirroring `commitNotReversibleNotice`'s own framing in Payroll's
 * `run-status-actions.tsx` for its own genuinely-final GL-posting action.
 */
export function DepreciationRunStatusActions({ run }: { run: FaDepreciationRunResponseDto }) {
  const t = useTranslations("fixedAssets.depreciationRuns.actions");
  const tCommon = useTranslations("common");
  const [confirmKind, setConfirmKind] = React.useState<ConfirmKind>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approvedNotice, setApprovedNotice] = React.useState(false);

  const submitMutation = useSubmitDepreciationRun();
  const decideMutation = useDecideDepreciationRun();
  const postMutation = usePostDepreciationRun();

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
        await submitMutation.mutateAsync(run.id);
      } else if (confirmKind === "approve" || confirmKind === "return") {
        await decideMutation.mutateAsync({ id: run.id, dto: { decision: confirmKind === "approve" ? "APPROVE" : "RETURN" } });
        setApprovedNotice(confirmKind === "approve");
      } else if (confirmKind === "post") {
        await postMutation.mutateAsync(run.id);
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
        {run.status === "DRAFT" && (
          <Button type="button" onClick={() => openConfirm("submit")}>
            <Send className="size-4" />
            {t("submitTrigger")}
          </Button>
        )}
        {run.status === "PENDING_APPROVAL" && (
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
        {run.status === "POSTED" && <p className="text-sm text-muted-foreground">{t("postedNotice")}</p>}
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
              <AlertDescription>{t("postNotReversibleNotice")}</AlertDescription>
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
