"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { WALLET_TOPUP_METHODS } from "../constants";
import { useTopUpWallet } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 2) — `POST wallets/:id/topup` (P-13). Generates a
 * real UUID `idempotencyKey` client-side per submit via `crypto.randomUUID()`
 * (same established pattern `receipt-capture-form.tsx`/`collect-fees-flow.tsx`
 * already use) — every mutating wallet call this dispatch builds does the
 * same.
 */
export function TopUpDialog({ walletId, studentId }: { walletId: string; studentId?: string }) {
  const t = useTranslations("wallet.topUp");
  const tMethod = useTranslations("wallet.methods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useTopUpWallet(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setMethod("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!amount || !method) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        amount,
        method: method as (typeof WALLET_TOPUP_METHODS)[number],
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
        <Button variant="outline">{t("trigger")}</Button>
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
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} currency={DEFAULT_CURRENCY} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("methodLabel")}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectMethod")} />
              </SelectTrigger>
              <SelectContent>
                {WALLET_TOPUP_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tMethod(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
