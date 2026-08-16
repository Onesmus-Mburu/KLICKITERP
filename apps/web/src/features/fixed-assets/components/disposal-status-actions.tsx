"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Archive, CheckCircle2, Send, Undo2 } from "lucide-react";
import type { FaDisposalResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideDisposal, usePostDisposal, useSubmitDisposal } from "../hooks/use-disposals";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "soft-success",
};

/** Reused by both the list page's table and this disposal's own detail header. */
export function DisposalStatusBadge({ status }: { status: string }) {
  const t = useTranslations("fixedAssets.disposalStatuses");
  return <Badge variant={STATUS_BADGE_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

type ConfirmKind = "submit" | "approve" | "return" | "post" | null;

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — the submit/decide/post
 * button cluster, one shared `ConfirmKind` confirm dialog per
 * `depreciation-run-status-actions.tsx`'s (Part 3) own precedent.
 *
 * **A genuine, CONFIRMED contrast with Part 3's own Depreciation Runs
 * finding — read this plainly before assuming the same workaround applies
 * here.** `fa_depreciation_run.status` is a 3-value enum with NO real
 * `APPROVED` value, forcing that component to show Post throughout the
 * whole `PENDING_APPROVAL` state (no client-visible signal distinguishes
 * "submitted" from "genuinely approved" there). `fa_disposal.status` is
 * DIFFERENT — a real, PERSISTED 4-value enum
 * (`DRAFT|PENDING_APPROVAL|APPROVED|POSTED`, mirroring `bank_transfer`'s own
 * shape, confirmed by reading `onApprovalDecided()` directly,
 * `disposal.service.ts:141-155`). **Post is therefore gated tightly here —
 * shown ONLY when `disposal.status === "APPROVED"`**, not throughout
 * `PENDING_APPROVAL` — this module's own real status genuinely tells the
 * user whether a decision has been recorded yet, so there is no need for
 * Part 3's own "let the real error speak" fallback framing (though `post()`
 * still independently re-verifies server-side regardless, same as every
 * other lifecycle endpoint in this codebase).
 *
 * **The interim "manual decide bypasses the real `appr_instance`" pattern
 * still applies underneath** — `decide()` never calls the real
 * `ApprovalEngineService.decide()`, only writes the LOCAL `fa_disposal.status`
 * column directly (confirmed by reading `onApprovalDecided()` directly). A
 * locally-`APPROVED` disposal is therefore not proof the real Approvals
 * instance was ever decided — but unlike Depreciation Runs, this doesn't
 * need a special "no Approved state exists" UI notice, since the LOCAL
 * status genuinely is what gates every subsequent screen/action in this
 * module. `postConfirmDescription` states the real P-31 breakdown plainly
 * rather than hedging about approval state, since that part is genuinely
 * unambiguous here.
 *
 * **Post's own confirm copy is deliberately framed as genuinely terminal,
 * not casually reversible** — `POSTED` is `fa_disposal`'s own final state;
 * mirrors `depreciation-run-status-actions.tsx`'s own `postNotReversibleNotice`
 * framing, and additionally states plainly that the asset's own `status`
 * becomes `DISPOSED` regardless of this disposal's `method` — see
 * `disposals.api.ts`'s own doc comment for why that distinction matters.
 */
export function DisposalStatusActions({ disposal }: { disposal: FaDisposalResponseDto }) {
  const t = useTranslations("fixedAssets.disposals.actions");
  const tCommon = useTranslations("common");
  const [confirmKind, setConfirmKind] = React.useState<ConfirmKind>(null);
  const [error, setError] = React.useState<string | null>(null);

  const submitMutation = useSubmitDisposal();
  const decideMutation = useDecideDisposal();
  const postMutation = usePostDisposal();

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
        await submitMutation.mutateAsync(disposal.id);
      } else if (confirmKind === "approve" || confirmKind === "return") {
        await decideMutation.mutateAsync({ id: disposal.id, dto: { decision: confirmKind === "approve" ? "APPROVE" : "RETURN" } });
      } else if (confirmKind === "post") {
        await postMutation.mutateAsync(disposal.id);
      }
      setConfirmKind(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {disposal.status === "DRAFT" && (
          <Button type="button" onClick={() => openConfirm("submit")}>
            <Send className="size-4" />
            {t("submitTrigger")}
          </Button>
        )}
        {disposal.status === "PENDING_APPROVAL" && (
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
          </>
        )}
        {disposal.status === "APPROVED" && (
          <Button type="button" onClick={() => openConfirm("post")}>
            <Archive className="size-4" />
            {t("postTrigger")}
          </Button>
        )}
        {disposal.status === "POSTED" && <p className="text-sm text-muted-foreground">{t("postedNotice")}</p>}
      </div>

      <Dialog open={confirmKind !== null} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmKind ? t(`${confirmKind}ConfirmTitle`) : ""}</DialogTitle>
            <DialogDescription>{confirmKind ? t(`${confirmKind}ConfirmDescription`) : ""}</DialogDescription>
          </DialogHeader>

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
