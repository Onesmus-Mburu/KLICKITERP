"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useRequestSuspenseRefund } from "../hooks/use-suspense";

/**
 * Cloned from `request-reversal-dialog.tsx` — `POST
 * /payments/suspense/{id}/refund/request` also takes no body (confirmed by
 * reading `SuspenseController.requestRefund()` directly: `@Param("id") id,
 * @Req() req` only), so this is a plain confirm dialog too.
 */
export function RequestSuspenseRefundDialog({ suspenseItemId }: { suspenseItemId: string }) {
  const t = useTranslations("payments.suspense.refund");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestMutation = useRequestSuspenseRefund(suspenseItemId);

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
