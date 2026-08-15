"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import {
  useCancelChequeLeaf,
  useMarkChequeLeafCleared,
  useMarkChequeLeafPresented,
  useStopChequeLeaf,
  type BankChequeLeafResponseDto,
} from "../hooks/use-cheque-leaves";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — one action set per current status, the same "confirm dialog per
 * decision, direct-click for the no-side-effect-detail transition" shape
 * `transfer-status-actions.tsx` (Part 2) already established: `ISSUED` gets
 * a direct-click Mark Presented plus Stop/Cancel (both reason-required,
 * behind their own dialogs); `PRESENTED` gets a direct-click Mark Cleared
 * plus Stop (no Cancel — `cancel()` only accepts `UNUSED`/`ISSUED`,
 * confirmed by reading `ChequeLeavesService.cancel()` directly); `UNUSED`
 * gets ONLY Cancel (no issue action here — issuing is book-level, not
 * leaf-level, see `issue-cheque-leaf-dialog.tsx`'s own doc comment on
 * BR-BANK-04). `CLEARED`/`STOPPED`/`CANCELLED`/`STALE` are all terminal —
 * nothing renders, the same "no action row once terminal" shape every prior
 * status-actions component in this codebase already establishes.
 *
 * **`stop()`/`cancel()` both REQUIRE a non-empty `reason`** — enforced
 * client-side here (`canSubmit` false on whitespace-only input, the SAME
 * `reason.trim().length > 0` guard `reopen-dialog.tsx` (Part 4) already
 * established) AND server-side (`ChequeLeavesService`'s own
 * `requireReason()`, a real `ValidationException` if bypassed).
 *
 * TWO different permissions gate the underlying routes — `banking:cheque-leaf:manage`
 * on every action below (issuing alone needs the separate `:issue`, not
 * relevant to this component) — never hidden client-side based on a guessed
 * permission (no permission-list endpoint exists anywhere in this codebase,
 * the same standing limitation every prior status-action component already
 * documents); a role missing it still sees the button, clicks it, and gets a
 * real 403 surfaced via `ApiError.message` in this component's own error
 * state.
 */
export function ChequeLeafStatusActions({ leaf }: { leaf: BankChequeLeafResponseDto }) {
  const t = useTranslations("banking.chequeLeaves.statusActions");
  const tCommon = useTranslations("common");

  const [presentedError, setPresentedError] = React.useState<string | null>(null);
  const [clearedError, setClearedError] = React.useState<string | null>(null);
  const [stopOpen, setStopOpen] = React.useState(false);
  const [stopReason, setStopReason] = React.useState("");
  const [stopError, setStopError] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const presentedMutation = useMarkChequeLeafPresented();
  const clearedMutation = useMarkChequeLeafCleared();
  const stopMutation = useStopChequeLeaf();
  const cancelMutation = useCancelChequeLeaf();

  async function handleMarkPresented() {
    setPresentedError(null);
    try {
      await presentedMutation.mutateAsync(leaf.id);
    } catch (err) {
      setPresentedError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleMarkCleared() {
    setClearedError(null);
    try {
      await clearedMutation.mutateAsync(leaf.id);
    } catch (err) {
      setClearedError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleStopOpenChange(next: boolean) {
    setStopOpen(next);
    if (next) {
      setStopReason("");
      setStopError(null);
    }
  }

  async function handleStop() {
    setStopError(null);
    try {
      await stopMutation.mutateAsync({ id: leaf.id, dto: { reason: stopReason.trim() } });
      setStopOpen(false);
    } catch (err) {
      setStopError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleCancelOpenChange(next: boolean) {
    setCancelOpen(next);
    if (next) {
      setCancelReason("");
      setCancelError(null);
    }
  }

  async function handleCancel() {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync({ id: leaf.id, dto: { reason: cancelReason.trim() } });
      setCancelOpen(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canStop = stopReason.trim().length > 0 && !stopMutation.isPending;
  const canCancel = cancelReason.trim().length > 0 && !cancelMutation.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {leaf.status === "ISSUED" && (
          <Button type="button" size="sm" onClick={() => void handleMarkPresented()} disabled={presentedMutation.isPending}>
            {presentedMutation.isPending ? t("markingPresented") : t("markPresentedTrigger")}
          </Button>
        )}

        {leaf.status === "PRESENTED" && (
          <Button type="button" size="sm" onClick={() => void handleMarkCleared()} disabled={clearedMutation.isPending}>
            {clearedMutation.isPending ? t("markingCleared") : t("markClearedTrigger")}
          </Button>
        )}

        {(leaf.status === "ISSUED" || leaf.status === "PRESENTED") && (
          <Dialog open={stopOpen} onOpenChange={handleStopOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                {t("stopTrigger")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("stopConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("stopConfirmDescription", { leafNo: leaf.leafNo })}</DialogDescription>
              </DialogHeader>
              {stopError && (
                <Alert variant="destructive">
                  <AlertDescription>{stopError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label required>{t("reasonLabel")}</Label>
                <Textarea value={stopReason} onChange={(e) => setStopReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={3} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStopOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleStop()} disabled={!canStop}>
                  {stopMutation.isPending ? t("stopping") : t("stopConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {(leaf.status === "UNUSED" || leaf.status === "ISSUED") && (
          <Dialog open={cancelOpen} onOpenChange={handleCancelOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                {t("cancelTrigger")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cancelConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("cancelConfirmDescription", { leafNo: leaf.leafNo })}</DialogDescription>
              </DialogHeader>
              {cancelError && (
                <Alert variant="destructive">
                  <AlertDescription>{cancelError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label required>{t("reasonLabel")}</Label>
                <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={3} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={!canCancel}>
                  {cancelMutation.isPending ? t("cancelling") : t("cancelConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {presentedError && (
        <Alert variant="destructive">
          <AlertDescription>{presentedError}</AlertDescription>
        </Alert>
      )}
      {clearedError && (
        <Alert variant="destructive">
          <AlertDescription>{clearedError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
