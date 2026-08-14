"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import type { TransferResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useCancelTransfer, useReceiveTransfer } from "../hooks/use-transfers";

/** `ISSUED`/`IN_TRANSIT` are the only 2 statuses `TransfersService.receive()`/`cancel()` accept — `RECEIVED`/`CANCELLED` are both terminal. `IN_TRANSIT` is never actually reachable via the current API (see `transfers.api.ts`'s own doc comment) but is included here defensively regardless, since the SERVER's own guard already accepts it. */
const ACTIONABLE_STATUSES = new Set(["ISSUED", "IN_TRANSIT"]);

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) —
 * Receive/Cancel, gated by `transfer.status`: both buttons render only while
 * `ACTIONABLE_STATUSES` includes the current status; `RECEIVED`/`CANCELLED`
 * render nothing (a terminal-state transfer has no further actions, the same
 * "no action row once terminal" shape `period-status-actions.tsx` already
 * establishes for fiscal periods). Receive is a direct-click action (no
 * confirm dialog — it's the expected, routine next step, not a destructive
 * one); Cancel goes behind a confirm dialog (mirrors `ReverseJournalDialog`'s
 * own destructive-flavored, deliberate-extra-click shape) since it reverses
 * an already-issued transfer's source-side stock movement.
 */
export function TransferStatusActions({ transfer }: { transfer: TransferResponseDto }) {
  const t = useTranslations("inventory.transfers.statusActions");
  const tCommon = useTranslations("common");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const receiveMutation = useReceiveTransfer();
  const cancelMutation = useCancelTransfer();

  if (!ACTIONABLE_STATUSES.has(transfer.status)) return null;

  async function handleReceive() {
    setError(null);
    try {
      await receiveMutation.mutateAsync(transfer.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleCancel() {
    setError(null);
    try {
      await cancelMutation.mutateAsync(transfer.id);
      setCancelOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void handleReceive()} disabled={receiveMutation.isPending}>
          <CheckCircle2 className="size-4" />
          {receiveMutation.isPending ? t("receiving") : t("receiveButton")}
        </Button>

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
              <XCircle className="size-4" />
              {t("cancelButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("cancelDialogTitle")}</DialogTitle>
              <DialogDescription>{t("cancelDialogDescription", { number: transfer.number })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? t("cancelling") : t("confirmCancelButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
