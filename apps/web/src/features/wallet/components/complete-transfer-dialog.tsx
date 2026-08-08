"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import type { Instance } from "@/features/approvals/types";
import { useTransferToFees, useTransferToWallet } from "../hooks/use-wallets";
import { InvoicePicker } from "./invoice-picker";
import { WalletPicker } from "./wallet-picker";

/**
 * Phase 6 Slice 11 (Part 3) — step 2 of 2 for an APPROVED WALLET_TRANSFER
 * instance. Since transfer-to-fees and transfer-to-wallet share ONE
 * approval domain/entity (see `constants.ts`'s doc comment), the approved
 * instance itself doesn't record which of the two sub-kinds it was for —
 * `appr_instance` only carries `amount`, not any operation-specific payload
 * (confirmed by reading `InstanceResponseDto` directly) — so this dialog
 * asks the user to pick the destination type again and re-supply the
 * destination (invoice or wallet), the same "re-collect what isn't
 * persisted" shape `ExecuteReversalDialog` already established for its own
 * `reasonCode`. `amount` is NOT re-collected — it's read directly off the
 * approved instance and shown read-only, since that's the one field the
 * approval engine DOES persist and the server's own `approvalRef`
 * verification is keyed to this instance regardless of what amount is sent
 * (a real, honestly-flagged gap — see this dispatch's PROGRESS.md section:
 * the execute endpoints never check the submitted amount against the
 * instance's approved amount).
 */
export function CompleteTransferDialog({
  walletId,
  studentId,
  instance,
}: {
  walletId: string;
  studentId: string | undefined;
  instance: Instance;
}) {
  const t = useTranslations("wallet.completeTransfer");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"FEES" | "WALLET">("FEES");
  const [invoiceId, setInvoiceId] = React.useState("");
  const [toWalletId, setToWalletId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const transferToFeesMutation = useTransferToFees(walletId, studentId);
  const transferToWalletMutation = useTransferToWallet(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMode("FEES");
      setInvoiceId("");
      setToWalletId("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    const amount = instance.amount ?? "0";
    try {
      if (mode === "FEES") {
        if (!invoiceId) {
          setError(t("selectInvoiceError"));
          return;
        }
        await transferToFeesMutation.mutateAsync({ amount, invoiceId, approvalRef: instance.id, idempotencyKey: crypto.randomUUID() });
      } else {
        if (!toWalletId) {
          setError(t("selectWalletError"));
          return;
        }
        await transferToWalletMutation.mutateAsync({ amount, toWalletId, approvalRef: instance.id, idempotencyKey: crypto.randomUUID() });
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const pending = transferToFeesMutation.isPending || transferToWalletMutation.isPending;

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
            <Label required>{t("destinationTypeLabel")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "FEES" | "WALLET")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FEES">{t("destinationFees")}</SelectItem>
                <SelectItem value="WALLET">{t("destinationWallet")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "FEES" ? (
            <div className="space-y-1.5">
              <Label required>{t("invoiceLabel")}</Label>
              <InvoicePicker studentId={studentId} value={invoiceId} onChange={setInvoiceId} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label required>{t("toWalletLabel")}</Label>
              <WalletPicker value={toWalletId} onChange={setToWalletId} excludeWalletId={walletId} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
