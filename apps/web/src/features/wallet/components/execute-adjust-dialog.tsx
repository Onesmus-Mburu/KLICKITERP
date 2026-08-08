"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import type { Instance } from "@/features/approvals/types";
import { useAdjustWallet } from "../hooks/use-wallets";

/** Phase 6 Slice 11 (Part 3) — step 2 of 2 for an APPROVED WALLET_ADJUSTMENT instance: `POST wallets/:id/adjust` with the now-available `approvalRef`. `direction`/`reasonCode` are re-collected (not persisted by the approval engine); `amount` is read-only, straight off the approved instance. */
export function ExecuteAdjustDialog({ walletId, studentId, instance }: { walletId: string; studentId: string | undefined; instance: Instance }) {
  const t = useTranslations("wallet.executeAdjust");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState<string>("");
  const [reasonCode, setReasonCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useAdjustWallet(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDirection("");
      setReasonCode("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!direction || !reasonCode.trim()) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        amount: instance.amount ?? "0",
        direction: direction as "D" | "C",
        reasonCode: reasonCode.trim(),
        approvalRef: instance.id,
        idempotencyKey: crypto.randomUUID(),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("approvedAmountLabel")}</Label>
            <p className="text-lg font-semibold text-foreground">{formatMoney(instance.amount ?? "0")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("directionLabel")}</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectDirection")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C">{t("directionCredit")}</SelectItem>
                <SelectItem value="D">{t("directionDebit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("reasonCodeLabel")}</Label>
            <Input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder={t("reasonCodePlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
