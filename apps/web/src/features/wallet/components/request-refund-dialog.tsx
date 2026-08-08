"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { WALLET_REFUND_METHODS } from "../constants";
import { useRequestRefund } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 3) — `POST wallets/:id/refund/request`. A refund
 * ALWAYS requires a pre-approved `approvalRef` (FR-WALL-013.1, no threshold
 * skip, unlike the two transfer flows) — this dialog never attempts a
 * direct `POST .../refund` call at all. Collects the REAL intended
 * `payoutMethod`/`payoutTarget` up front (a genuinely useful part of what
 * the approver is being asked to authorize) — see `wallets.api.ts`'s own
 * doc comment on `requestRefund()` for why a placeholder `approvalRef` UUID
 * is sent underneath (a real, confirmed backend DTO-reuse validation gap,
 * never surfaced to the user here).
 */
export function RequestRefundDialog({ walletId }: { walletId: string }) {
  const t = useTranslations("wallet.requestRefund");
  const tMethod = useTranslations("wallet.refundMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = React.useState<string>("");
  const [guardianId, setGuardianId] = React.useState("");
  const [accountRef, setAccountRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const mutation = useRequestRefund(walletId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setPayoutMethod("");
      setGuardianId("");
      setAccountRef("");
      setError(null);
      setSubmitted(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!amount || !payoutMethod || !guardianId) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        amount,
        payoutMethod: payoutMethod as (typeof WALLET_REFUND_METHODS)[number],
        payoutTarget: { guardianId, accountRef: accountRef.trim() || undefined },
        // Placeholder only — never read server-side for the /request step, see this file's own doc comment.
        approvalRef: crypto.randomUUID(),
      });
      setSubmitted(true);
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

        {submitted ? (
          <Alert variant="success">
            <AlertDescription>{t("submittedForApproval")}</AlertDescription>
          </Alert>
        ) : (
          <>
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
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {submitted ? tCommon("close") : tCommon("cancel")}
          </Button>
          {!submitted && (
            <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
              {mutation.isPending ? t("submitting") : t("submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
