"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import type { InvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useVoidInvoice } from "../hooks/use-invoices";
import { isPositiveMoney } from "../lib/errors";

/**
 * `POST /billing/invoices/:id/void` — BR-BILL-09: only while `paidAmount=0`
 * (a real, permanent block once any adjustment has touched the invoice —
 * this slice can't fully exercise that block since it doesn't build
 * concessions/credit-notes, noted honestly in verification rather than
 * forced). Real confirm dialog, same trigger+confirm-`Dialog`+error-banner
 * shape `DeleteClassButton`/`DeleteStudentButton` already established —
 * disabled with a clear explanation once `invoice.paidAmount` is genuinely
 * positive, rather than a plain disabled button with no reason given.
 */
export function VoidInvoiceButton({ invoice }: { invoice: InvoiceResponseDto }) {
  const t = useTranslations("billing.invoices.detail.voidDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const voidMutation = useVoidInvoice(invoice.id, invoice.studentId);

  const blocked = isPositiveMoney(invoice.paidAmount);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
    }
  }

  async function handleConfirm() {
    setError(null);
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    try {
      await voidMutation.mutateAsync({ reason });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (blocked) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" disabled>
          <Ban className="size-4" />
          {t("trigger")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("blockedHint")}</p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
          <Ban className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: invoice.number })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reasonLabel")}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={voidMutation.isPending}>
            {voidMutation.isPending ? t("voiding") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
