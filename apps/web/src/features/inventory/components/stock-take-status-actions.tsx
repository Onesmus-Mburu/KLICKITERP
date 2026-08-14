"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, ClipboardCheck, Send, Undo2 } from "lucide-react";
import type { StockTakeResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAuthStore } from "@/lib/auth-store";
import { useDecideInstance } from "@/features/approvals/hooks/use-instances";
import {
  STOCK_TAKES_QUERY_KEY,
  useDecideStockTake,
  usePostStockTake,
  useStockTakeApprovalStatus,
  useSubmitStockTake,
} from "../hooks/use-stock-takes";

type DomainDecision = "APPROVE" | "RETURN";

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) —
 * Submit/Decide/Post, one component per `status`-dependent section (no
 * action row for OPEN/COUNTING — counting happens in
 * `<StockTakeCountForm>` — or for the terminal POSTED/CANCELLED, matching
 * `<TransferStatusActions>`'s own "no action row once terminal" precedent).
 *
 * **Decide is TWO real API calls chained, not one** — a genuine,
 * previously-undocumented finding from this part's own live verification
 * (see `stock-takes.api.ts`'s doc comment for the full story):
 * `POST /inventory/stock-takes/{id}/decide` ALONE never touches the
 * underlying `appr_instance` — confirmed live, calling it by itself left
 * `GET /approvals/instances/{id}` at `PENDING` with zero change. The REAL
 * decision is the ALREADY-SHIPPED `features/approvals`' own
 * `useDecideInstance()` (`POST /approvals/instances/{id}/decide`) — reused
 * here, not duplicated — called FIRST, then this domain's own `/decide` to
 * sync `inv_stock_take.status` (the real, visible transition for RETURN;
 * a harmless re-validating no-op for APPROVE, see `StockTakesService.onApprovalDecided()`'s
 * own doc comment on why no `APPROVED` status exists on this entity at all).
 *
 * **Post is gated on the REAL `appr_instance.status`, never `stockTake.status`**
 * (`useStockTakeApprovalStatus()`, `GET /approvals/instances/{approvalRef}`)
 * — `stockTake.status` stays `PENDING_APPROVAL` even after a genuine
 * APPROVE decision (there is no seventh `APPROVED` value in
 * `INV_STOCK_TAKE_STATUSES`), so it can NEVER be used to decide whether Post
 * should be enabled. `approvalRef === null` (not yet submitted — shouldn't
 * actually reach this component in that state, since Post only ever renders
 * for `status==='PENDING_APPROVAL'`, which always carries a real
 * `approvalRef`, but handled defensively regardless) disables Post with a
 * clear message rather than an indefinite spinner (`enabled: !!approvalRef`
 * on the query itself already prevents a doomed fetch).
 *
 * Self-approval (BR-APPR-01: an initiator can never decide their own
 * request) is surfaced via the real server 403 `ApiError.message`, not
 * pre-empted client-side — `features/approvals/components/decide-buttons.tsx`'s
 * own `isSelfInitiated` check is a UX nicety this component mirrors ONLY
 * once the approval instance's `initiatorId` is actually known (from
 * `useStockTakeApprovalStatus()`'s own response), since `StockTakeResponseDto`
 * itself carries no initiator field.
 */
export function StockTakeStatusActions({ stockTake }: { stockTake: StockTakeResponseDto }) {
  const t = useTranslations("inventory.stockTakes.statusActions");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [returnDialogOpen, setReturnDialogOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const submitMutation = useSubmitStockTake();
  const decideInstanceMutation = useDecideInstance(stockTake.approvalRef ?? "");
  const decideStockTakeMutation = useDecideStockTake();
  const postMutation = usePostStockTake();
  const approvalStatusQuery = useStockTakeApprovalStatus(stockTake.approvalRef);

  async function handleSubmit() {
    setError(null);
    try {
      await submitMutation.mutateAsync(stockTake.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function runDecision(decision: DomainDecision, decisionComment?: string) {
    await decideInstanceMutation.mutateAsync({ decision, ...(decisionComment ? { comment: decisionComment } : {}) });
    await decideStockTakeMutation.mutateAsync({ id: stockTake.id, dto: { decision } });
    queryClient.invalidateQueries({ queryKey: STOCK_TAKES_QUERY_KEY });
  }

  async function handleApprove() {
    setError(null);
    try {
      await runDecision("APPROVE");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function openReturnDialog() {
    setComment("");
    setCommentError(null);
    setError(null);
    setReturnDialogOpen(true);
  }

  async function handleReturnSubmit() {
    if (!comment.trim()) {
      setCommentError(t("commentRequired"));
      return;
    }
    setCommentError(null);
    setError(null);
    try {
      await runDecision("RETURN", comment.trim());
      setReturnDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handlePost() {
    setError(null);
    try {
      await postMutation.mutateAsync(stockTake.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (stockTake.status === "REVIEW") {
    return (
      <div className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
          <Send className="size-4" />
          {submitMutation.isPending ? t("submitting") : t("submitButton")}
        </Button>
      </div>
    );
  }

  if (stockTake.status === "PENDING_APPROVAL") {
    const instance = approvalStatusQuery.data;
    const instanceIsPending = instance?.status === "PENDING";
    const instanceIsApproved = instance?.status === "APPROVED";
    const isSelfInitiated = !!currentUserId && !!instance && currentUserId === instance.initiatorId;
    const decideDisabled = decideInstanceMutation.isPending || decideStockTakeMutation.isPending || isSelfInitiated;

    return (
      <div className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isSelfInitiated && (
          <Alert variant="warning">
            <AlertDescription>{t("selfInitiatedHint")}</AlertDescription>
          </Alert>
        )}

        {instanceIsPending && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void handleApprove()} disabled={decideDisabled}>
              <CheckCircle2 className="size-4" />
              {t("approveButton")}
            </Button>
            <Button type="button" variant="outline" onClick={openReturnDialog} disabled={decideDisabled}>
              <Undo2 className="size-4" />
              {t("returnButton")}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">
            {approvalStatusQuery.isPending
              ? t("checkingApprovalStatus")
              : instanceIsApproved
                ? t("approvalStatusApproved")
                : t("approvalStatusNotYet", { status: instance?.status ?? "?" })}
          </div>
          <Button type="button" onClick={() => void handlePost()} disabled={!instanceIsApproved || postMutation.isPending}>
            <ClipboardCheck className="size-4" />
            {postMutation.isPending ? t("posting") : t("postButton")}
          </Button>
        </div>

        <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("returnDialogTitle")}</DialogTitle>
              <DialogDescription>{t("returnDialogDescription")}</DialogDescription>
            </DialogHeader>
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
              <Button type="button" variant="outline" onClick={() => setReturnDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleReturnSubmit()} disabled={decideDisabled}>
                {decideDisabled ? t("submitting") : t("returnDialogSubmit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
