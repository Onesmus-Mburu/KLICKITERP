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
import { WALLET_REFUND_METHODS } from "../constants";
import { useRefundWallet } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 3) — step 2 of 2 for an APPROVED WALLET_REFUND
 * instance: `POST wallets/:id/refund` with the now-available `approvalRef`.
 * `payoutMethod`/`payoutTarget` are re-collected here (not persisted by the
 * approval engine — same "re-ask what isn't stored" shape
 * `CompleteTransferDialog` and `ExecuteReversalDialog` both already use);
 * `amount` is read-only, straight off the approved instance.
 *
 * BR-WALL-06 note (found reading `assertPayoutTargetVerified()` directly):
 * the guardian's `payout_verified` JSON must already carry a truthy entry
 * for the chosen method — no UI anywhere in this codebase sets that flag
 * (confirmed — no endpoint exists), so a REAL refund attempt against a
 * guardian who has never been marked verified genuinely fails here with a
 * real 422, surfaced as-is via the generic error fallback below, per this
 * dispatch's own "surface it, don't invent a workaround" discipline.
 */
export function ExecuteRefundDialog({ walletId, studentId, instance }: { walletId: string; studentId: string | undefined; instance: Instance }) {
  const t = useTranslations("wallet.executeRefund");
  const tMethod = useTranslations("wallet.refundMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [payoutMethod, setPayoutMethod] = React.useState<string>("");
  const [guardianId, setGuardianId] = React.useState("");
  const [accountRef, setAccountRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useRefundWallet(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPayoutMethod("");
      setGuardianId("");
      setAccountRef("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!payoutMethod || !guardianId) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        amount: instance.amount ?? "0",
        payoutMethod: payoutMethod as (typeof WALLET_REFUND_METHODS)[number],
        payoutTarget: { guardianId, accountRef: accountRef.trim() || undefined },
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
            <Label required>{t("payoutMethodLabel")}</Label>
            <Select value={payoutMethod} onValueChange={setPayoutMethod}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectPayoutMethod")} />
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
            <Label required>{t("guardianIdLabel")}</Label>
            <Input value={guardianId} onChange={(e) => setGuardianId(e.target.value)} placeholder={t("guardianIdPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("accountRefLabel")}</Label>
            <Input value={accountRef} onChange={(e) => setAccountRef(e.target.value)} />
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
