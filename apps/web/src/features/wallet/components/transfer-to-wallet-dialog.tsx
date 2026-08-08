"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { isTransferNeedsApprovalError } from "../lib/errors";
import { useRequestTransferToWallet, useTransferToWallet } from "../hooks/use-wallets";
import { WalletPicker } from "./wallet-picker";

/**
 * Phase 6 Slice 11 (Part 3) — `POST wallets/:id/transfer-to-wallet` (P-17),
 * same threshold-gated error-driven branching shape as
 * `TransferToFeesDialog` (both share ONE `WALLET_TRANSFER` approval
 * domain/entity — see `constants.ts`'s own doc comment on why only one of
 * the two transfer sub-kinds can have a PENDING request in flight for a
 * given wallet at a time).
 */
export function TransferToWalletDialog({ walletId, studentId }: { walletId: string; studentId: string | undefined }) {
  const t = useTranslations("wallet.transferToWallet");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [toWalletId, setToWalletId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const directMutation = useTransferToWallet(walletId, studentId);
  const requestMutation = useRequestTransferToWallet(walletId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setToWalletId("");
      setError(null);
      setNeedsApproval(false);
      setSubmitted(false);
    }
  }

  async function handleDirectAttempt() {
    setError(null);
    if (!amount || !toWalletId) {
      setError(t("validationError"));
      return;
    }
    try {
      await directMutation.mutateAsync({ amount, toWalletId, idempotencyKey: crypto.randomUUID() });
      setOpen(false);
    } catch (err) {
      if (isTransferNeedsApprovalError(err)) {
        setNeedsApproval(true);
        setError(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleSubmitForApproval() {
    setError(null);
    if (!amount || !toWalletId) {
      setError(t("validationError"));
      return;
    }
    try {
      await requestMutation.mutateAsync({ amount, toWalletId });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const pending = directMutation.isPending || requestMutation.isPending;

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

        {submitted ? (
          <Alert variant="success">
            <AlertDescription>{t("submittedForApproval")}</AlertDescription>
          </Alert>
        ) : (
          <>
            {error && (
              <Alert variant={needsApproval ? "warning" : "destructive"}>
                <AlertDescription>{needsApproval ? t("needsApprovalHint") : error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label required>{t("amountLabel")}</Label>
                <MoneyInput value={amount ?? ""} onValueChange={setAmount} currency={DEFAULT_CURRENCY} disabled={needsApproval} />
              </div>
              <div className="space-y-1.5">
                <Label required>{t("toWalletLabel")}</Label>
                <WalletPicker value={toWalletId} onChange={setToWalletId} excludeWalletId={walletId} disabled={needsApproval} />
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {submitted ? tCommon("close") : tCommon("cancel")}
          </Button>
          {!submitted &&
            (needsApproval ? (
              <Button onClick={() => void handleSubmitForApproval()} disabled={pending}>
                {requestMutation.isPending ? t("submittingForApproval") : t("submitForApproval")}
              </Button>
            ) : (
              <Button onClick={() => void handleDirectAttempt()} disabled={pending}>
                {directMutation.isPending ? t("submitting") : t("submit")}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
