"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useBounceCheque } from "../hooks/use-cheques";
import type { Cheque } from "../types";

/**
 * Bounce bypasses Approvals entirely (confirmed by reading
 * `ChequesController.bounce()`/`ChequesService.bounce()` — a direct action,
 * no request/decide two-step, per the plan's own verified backend fact) —
 * this is a confirm dialog with the `applyBounceFee` toggle, not an
 * approval-request form. The fee AMOUNT is never offered here: it's entirely
 * server-controlled (a Settings key, `payments.cheque_bounce_fee_amount`,
 * defaulting to KES 500.00 — confirmed by reading `ChequesService`'s own
 * constants), stated plainly in this dialog's copy rather than implying the
 * form sets it.
 */
export function BounceChequeDialog({ cheque }: { cheque: Cheque }) {
  const t = useTranslations("payments.cheques");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [applyBounceFee, setApplyBounceFee] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bounceMutation = useBounceCheque();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApplyBounceFee(false);
      setError(null);
    }
  }

  async function handleConfirm() {
    setError(null);
    try {
      await bounceMutation.mutateAsync({ id: cheque.id, dto: { applyBounceFee } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <XCircle className="size-4" />
          {t("bounceTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bounceTitle")}</DialogTitle>
          <DialogDescription>{t("bounceDescription", { chequeNo: cheque.chequeNo, bankName: cheque.bankName })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={applyBounceFee}
            onChange={(e) => setApplyBounceFee(e.target.checked)}
            className="size-4 rounded border-input"
          />
          {t("applyBounceFeeLabel")}
        </label>
        <p className="text-xs text-muted-foreground">{t("bounceFeeHint")}</p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={bounceMutation.isPending}>
            {bounceMutation.isPending ? t("bouncing") : t("bounceConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
