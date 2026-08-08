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
import { useRequestAdjust } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 3) — `POST wallets/:id/adjust/request`. A manual
 * adjustment ALWAYS requires a pre-approved `approvalRef` (BR-WALL-05) — no
 * direct-call path exists in this UI at all, same discipline as
 * `RequestRefundDialog`. See `wallets.api.ts`'s own doc comment on
 * `requestAdjust()` for why a placeholder `approvalRef` UUID is sent
 * underneath (the same confirmed backend DTO-reuse validation gap the
 * refund request shares).
 */
export function RequestAdjustDialog({ walletId }: { walletId: string }) {
  const t = useTranslations("wallet.requestAdjust");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<string>("");
  const [reasonCode, setReasonCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const mutation = useRequestAdjust(walletId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setDirection("");
      setReasonCode("");
      setError(null);
      setSubmitted(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!amount || !direction || !reasonCode.trim()) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        amount,
        direction: direction as "D" | "C",
        reasonCode: reasonCode.trim(),
        // Placeholder only — never read server-side for the /request step, see wallets.api.ts's own doc comment.
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
