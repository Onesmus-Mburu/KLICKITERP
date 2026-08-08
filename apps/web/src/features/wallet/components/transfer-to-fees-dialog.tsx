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
import { useRequestTransferToFees, useTransferToFees } from "../hooks/use-wallets";
import { InvoicePicker } from "./invoice-picker";

/**
 * Phase 6 Slice 11 (Part 3) — `POST wallets/:id/transfer-to-fees` (P-15),
 * threshold-gated (~KES 5,000 by default, `wallet.transfer_approval_threshold`
 * — read live, never re-implemented client-side). Mirrors the exact
 * error-driven branching UX this codebase already established for M-Pesa
 * STK's own threshold handling (Slice 6/9): attempt the direct call FIRST
 * with no `approvalRef`; only once the REAL 422
 * (`isTransferNeedsApprovalError`, matched on the `FR-WALL-013.1` marker
 * `assertBelowThresholdOrApproved()` throws) comes back does this dialog
 * branch into "submit for approval instead" — never a client-side threshold
 * guess.
 */
export function TransferToFeesDialog({ walletId, studentId }: { walletId: string; studentId: string | undefined }) {
  const t = useTranslations("wallet.transferToFees");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const directMutation = useTransferToFees(walletId, studentId);
  const requestMutation = useRequestTransferToFees(walletId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setInvoiceId("");
      setError(null);
      setNeedsApproval(false);
      setSubmitted(false);
    }
  }

  async function handleDirectAttempt() {
    setError(null);
    if (!amount || !invoiceId) {
      setError(t("validationError"));
      return;
    }
    try {
      await directMutation.mutateAsync({ amount, invoiceId, idempotencyKey: crypto.randomUUID() });
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
    if (!amount || !invoiceId) {
      setError(t("validationError"));
      return;
    }
    try {
      await requestMutation.mutateAsync({ amount, invoiceId });
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
                <Label required>{t("invoiceLabel")}</Label>
                <InvoicePicker studentId={studentId} value={invoiceId} onChange={setInvoiceId} disabled={needsApproval} />
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
