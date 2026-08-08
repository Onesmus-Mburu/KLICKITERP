"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import type { ReceiptResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { RECEIPT_REVERSAL_REASON_CODES, type ReceiptReversalReasonCode } from "../constants";
import { pickLatestInstanceForEntity } from "../lib/reversal";
import { useReverseReceipt, type useReceiptReversalInstance } from "../hooks/use-receipts";

type ReversalInstanceQuery = ReturnType<typeof useReceiptReversalInstance>;

/**
 * `POST /payments/receipts/{id}/reverse` requires `{reasonCode,
 * approvalRef}` — the reason `<Select>` the plan's "Screens" section
 * describes for the REQUEST dialog actually belongs here, where the real
 * `ReverseReceiptDto` has the field (see `request-reversal-dialog.tsx`'s own
 * doc comment on this reconciliation).
 *
 * "Always use the freshest instance": `handleExecute()` calls
 * `reversalQuery.refetch()` FIRST and re-derives the latest matching
 * instance from that fresh result via `pickLatestInstanceForEntity()` —
 * never the (possibly stale, e.g. window not refocused since a supervisor
 * decided it seconds ago) `reversalQuery.latestInstance` the panel rendered
 * the trigger button from. The server re-verifies `approvalRef` is the
 * CURRENT `APPROVED` instance regardless (`BR-PAY-08`), so this is a UX
 * nicety that avoids a predictable, avoidable round-trip failure, not a
 * security boundary.
 */
export function ExecuteReversalDialog({
  receiptId,
  reversalQuery,
  onReversed,
}: {
  receiptId: string;
  reversalQuery: ReversalInstanceQuery;
  onReversed: (contra: ReceiptResponseDto) => void;
}) {
  const t = useTranslations("payments.receiptDetail.reversal");
  const tCommon = useTranslations("common");
  const tReason = useTranslations("payments.receiptDetail.reversal.reasonValues");
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<ReceiptReversalReasonCode | "">("");
  const [error, setError] = React.useState<string | null>(null);
  const reverseMutation = useReverseReceipt(receiptId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReasonCode("");
      setError(null);
    }
  }

  async function handleExecute() {
    if (!reasonCode) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    const fresh = await reversalQuery.refetch();
    const freshest = pickLatestInstanceForEntity(fresh.data ?? [], receiptId);
    if (!freshest || freshest.status !== "APPROVED") {
      setError(t("noLongerApprovedError"));
      return;
    }
    try {
      const contra = await reverseMutation.mutateAsync({ reasonCode, approvalRef: freshest.id });
      setOpen(false);
      onReversed(contra);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("executeGenericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <PlayCircle className="size-4" />
          {t("executeTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("executeTitle")}</DialogTitle>
          <DialogDescription>{t("executeDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reasonLabel")}</Label>
          <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as ReceiptReversalReasonCode)}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectReason")} />
            </SelectTrigger>
            <SelectContent>
              {RECEIPT_REVERSAL_REASON_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {tReason(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleExecute()} disabled={reverseMutation.isPending}>
            {reverseMutation.isPending ? t("executing") : t("executeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
