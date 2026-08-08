"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useClearCheque } from "../hooks/use-cheques";
import type { Cheque } from "../types";

/** A plain confirm dialog (same shape `RequestReversalDialog` establishes) around `POST .../{id}/clear` — no body, a trivial status flip, but still gated behind an explicit confirm step since it's a financial-record action, matching this codebase's own established caution for every other payments action. */
export function ClearChequeDialog({ cheque }: { cheque: Cheque }) {
  const t = useTranslations("payments.cheques");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const clearMutation = useClearCheque();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await clearMutation.mutateAsync(cheque.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CheckCircle2 className="size-4" />
          {t("clearTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clearTitle")}</DialogTitle>
          <DialogDescription>{t("clearDescription", { chequeNo: cheque.chequeNo, bankName: cheque.bankName })}</DialogDescription>
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
          <Button type="button" onClick={() => void handleConfirm()} disabled={clearMutation.isPending}>
            {clearMutation.isPending ? t("clearing") : t("clearConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
