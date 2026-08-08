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
import { WALLET_CLOSE_DISPOSITIONS, WALLET_REFUND_METHODS, type WalletCloseDisposition } from "../constants";
import { isNegativeBalanceCloseError } from "../lib/errors";
import { useCloseWallet } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 2) — `POST wallets/:id/close` (BR-WALL-07). Each
 * disposition needs different real sub-fields per `CloseWalletDto`/
 * `CloseWalletRefundDto` (read in full before building this — see
 * `packages/server/src/domains/wallet/api/dto/wallet-transaction.dto.ts`):
 *
 *  - REFUND: `payoutMethod` + `payoutTarget.{guardianId,accountRef?}` +
 *    a REQUIRED `approvalRef` (a WALLET_REFUND `appr_instance` id already in
 *    APPROVED status — FR-WALL-013.1, no threshold skip, unlike transfers).
 *    This dispatch does not build the submit/decide approval dance (Part 3's
 *    job) — the field is exposed for completeness/DTO-correctness, but a
 *    REFUND-disposition close genuinely needs an already-approved instance
 *    id obtained some other way until Part 3 ships.
 *  - TRANSFER_TO_SIBLING: `transferToSiblingWalletId` + an OPTIONAL
 *    `approvalRef` (only required once the amount exceeds the transfer
 *    approval threshold — omitted below it, matching the real backend
 *    behavior exactly, not faked client-side).
 *  - APPLY_TO_FEES: `applyToFeesInvoiceId` + the same optional
 *    threshold-gated `approvalRef`.
 *
 * Every sub-field here is a plain UUID text input (no sibling-wallet/
 * invoice/guardian search picker exists anywhere in this codebase yet —
 * deliberately out of this dispatch's scope, matching the plan's "you just
 * need a read-only picker here" scoping discipline elsewhere).
 *
 * The backend does NOT require the wallet to already be at zero balance —
 * a positive balance is automatically zeroed via the chosen disposition
 * first (confirmed by reading `WalletTransactionsService.closeWallet()`
 * directly); ONLY a NEGATIVE balance (an overdraft) is rejected outright,
 * surfaced as-is via `isNegativeBalanceCloseError`, never pre-blocked
 * client-side, per the plan's explicit instruction.
 */
export function CloseWalletDialog({ walletId, studentId }: { walletId: string; studentId?: string }) {
  const t = useTranslations("wallet.close");
  const tDisposition = useTranslations("wallet.close.dispositions");
  const tMethod = useTranslations("wallet.refundMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [disposition, setDisposition] = React.useState<WalletCloseDisposition>("APPLY_TO_FEES");
  const [reason, setReason] = React.useState("");
  const [refundPayoutMethod, setRefundPayoutMethod] = React.useState<string>("");
  const [refundGuardianId, setRefundGuardianId] = React.useState("");
  const [refundAccountRef, setRefundAccountRef] = React.useState("");
  const [refundApprovalRef, setRefundApprovalRef] = React.useState("");
  const [siblingWalletId, setSiblingWalletId] = React.useState("");
  const [applyToFeesInvoiceId, setApplyToFeesInvoiceId] = React.useState("");
  const [approvalRef, setApprovalRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [negativeBalance, setNegativeBalance] = React.useState(false);
  const mutation = useCloseWallet(walletId, studentId);

  function reset() {
    setDisposition("APPLY_TO_FEES");
    setReason("");
    setRefundPayoutMethod("");
    setRefundGuardianId("");
    setRefundAccountRef("");
    setRefundApprovalRef("");
    setSiblingWalletId("");
    setApplyToFeesInvoiceId("");
    setApprovalRef("");
    setError(null);
    setNegativeBalance(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset();
  }

  async function handleSubmit() {
    setError(null);
    setNegativeBalance(false);
    try {
      await mutation.mutateAsync({
        disposition,
        reason: reason.trim() || undefined,
        refund:
          disposition === "REFUND"
            ? {
                payoutMethod: refundPayoutMethod as (typeof WALLET_REFUND_METHODS)[number],
                payoutTarget: { guardianId: refundGuardianId, accountRef: refundAccountRef.trim() || undefined },
                approvalRef: refundApprovalRef,
              }
            : undefined,
        transferToSiblingWalletId: disposition === "TRANSFER_TO_SIBLING" ? siblingWalletId : undefined,
        applyToFeesInvoiceId: disposition === "APPLY_TO_FEES" ? applyToFeesInvoiceId : undefined,
        approvalRef: disposition !== "REFUND" && approvalRef.trim() ? approvalRef.trim() : undefined,
      });
      setOpen(false);
    } catch (err) {
      if (isNegativeBalanceCloseError(err)) {
        setNegativeBalance(true);
        setError(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant={negativeBalance ? "warning" : "destructive"}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("dispositionLabel")}</Label>
            <Select value={disposition} onValueChange={(v) => setDisposition(v as WalletCloseDisposition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WALLET_CLOSE_DISPOSITIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {tDisposition(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {disposition === "REFUND" && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1.5">
                <Label required>{t("refund.payoutMethodLabel")}</Label>
                <Select value={refundPayoutMethod} onValueChange={setRefundPayoutMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("refund.selectPayoutMethod")} />
                  </SelectTrigger>
                  <SelectContent>
                    {WALLET_REFUND_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {tMethod(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label required>{t("refund.guardianIdLabel")}</Label>
                <Input value={refundGuardianId} onChange={(e) => setRefundGuardianId(e.target.value)} placeholder={t("refund.guardianIdPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("refund.accountRefLabel")}</Label>
                <Input value={refundAccountRef} onChange={(e) => setRefundAccountRef(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label required>{t("refund.approvalRefLabel")}</Label>
                <Input value={refundApprovalRef} onChange={(e) => setRefundApprovalRef(e.target.value)} placeholder={t("refund.approvalRefPlaceholder")} />
                <p className="text-xs text-muted-foreground">{t("refund.approvalRefHint")}</p>
              </div>
            </div>
          )}

          {disposition === "TRANSFER_TO_SIBLING" && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1.5">
                <Label required>{t("transferToSibling.walletIdLabel")}</Label>
                <Input value={siblingWalletId} onChange={(e) => setSiblingWalletId(e.target.value)} placeholder={t("transferToSibling.walletIdPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("approvalRefLabel")}</Label>
                <Input value={approvalRef} onChange={(e) => setApprovalRef(e.target.value)} placeholder={t("approvalRefPlaceholder")} />
                <p className="text-xs text-muted-foreground">{t("approvalRefOptionalHint")}</p>
              </div>
            </div>
          )}

          {disposition === "APPLY_TO_FEES" && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1.5">
                <Label required>{t("applyToFees.invoiceIdLabel")}</Label>
                <Input value={applyToFeesInvoiceId} onChange={(e) => setApplyToFeesInvoiceId(e.target.value)} placeholder={t("applyToFees.invoiceIdPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("approvalRefLabel")}</Label>
                <Input value={approvalRef} onChange={(e) => setApprovalRef(e.target.value)} placeholder={t("approvalRefPlaceholder")} />
                <p className="text-xs text-muted-foreground">{t("approvalRefOptionalHint")}</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("reasonLabel")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
