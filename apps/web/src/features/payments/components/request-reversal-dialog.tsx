"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useRequestReceiptReversal } from "../hooks/use-receipts";

/**
 * A plain confirm dialog, not a reason-collecting form — `POST
 * /payments/receipts/{id}/reverse/request` genuinely takes no body
 * (confirmed by reading `receipts.controller.ts`'s `requestReversal()`
 * directly; see `receipts.api.ts`'s own doc comment on this same point,
 * reconciling the plan's "Screens" section against its own separately-
 * verified "backend facts" section). The reason code belongs to the EXECUTE
 * step instead (`ExecuteReversalDialog`), where the real `ReverseReceiptDto`
 * actually has a `reasonCode` field.
 */
export function RequestReversalDialog({ receiptId }: { receiptId: string }) {
  const t = useTranslations("payments.receiptDetail.reversal");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestMutation = useRequestReceiptReversal(receiptId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await requestMutation.mutateAsync();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("requestGenericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <RotateCcw className="size-4" />
          {t("requestTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requestTitle")}</DialogTitle>
          <DialogDescription>{t("requestDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={requestMutation.isPending}>
            {requestMutation.isPending ? t("requesting") : t("requestConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
