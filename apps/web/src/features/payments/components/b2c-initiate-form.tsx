"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { MpesaTransactionResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, formatMoney, normalizeMoneyInput } from "@/lib/money";
import { useInitiateB2c } from "../hooks/use-mpesa";

/**
 * `POST /payments/mpesa/b2c` — a real initiate call (e.g. a refund-voucher
 * payout), returning a real `{id, conversationId, state:"PENDING",...}`. Per
 * the plan's explicit instruction: B2C has NO status signal at all after
 * initiation (`MpesaController` has no read/status route for it, and unlike
 * STK there is no receipt to go looking for — a B2C payout never produces a
 * `pay_receipt`). This form says so plainly rather than implying tracking
 * that doesn't exist — confirm completion through the M-Pesa business
 * portal / Daraja directly, or wait for the `/callbacks/mpesa/b2c-result`
 * webhook to eventually update this transaction's own `state` server-side
 * (invisible to this app, since no read endpoint surfaces it).
 */
export function B2cInitiateForm() {
  const t = useTranslations("payments.mpesa.b2c");
  const [amount, setAmount] = React.useState("");
  const [msisdn, setMsisdn] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [originatingReason, setOriginatingReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MpesaTransactionResponseDto | null>(null);

  const initiateMutation = useInitiateB2c();

  async function handleSubmit() {
    setError(null);
    const normalizedAmount = normalizeMoneyInput(amount);
    if (!normalizedAmount) {
      setError(t("amountRequired"));
      return;
    }
    if (!msisdn.trim()) {
      setError(t("msisdnRequired"));
      return;
    }
    if (!remarks.trim()) {
      setError(t("remarksRequired"));
      return;
    }
    try {
      const txn = await initiateMutation.mutateAsync({
        amountKes: normalizedAmount,
        msisdn: msisdn.trim(),
        remarks: remarks.trim(),
        originatingReason: originatingReason.trim() || undefined,
      });
      setResult(txn);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleReset() {
    setAmount("");
    setMsisdn("");
    setRemarks("");
    setOriginatingReason("");
    setError(null);
    setResult(null);
  }

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <AlertDescription>{t("noTrackingHint")}</AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!result ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("amount")}</Label>
              <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} currency={DEFAULT_CURRENCY} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("msisdn")}</Label>
              <Input value={msisdn} onChange={(e) => setMsisdn(e.target.value)} placeholder={t("msisdnPlaceholder")} maxLength={15} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("remarks")}</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("originatingReason")}</Label>
            <Input value={originatingReason} onChange={(e) => setOriginatingReason(e.target.value)} maxLength={100} />
          </div>
          <Button type="button" onClick={() => void handleSubmit()} disabled={initiateMutation.isPending}>
            {initiateMutation.isPending ? t("initiating") : t("submit")}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <Alert variant="success">
            <AlertDescription className="space-y-1">
              <p>{t("initiatedDescription", { amount: formatMoney(result.amount) })}</p>
              <p className="text-xs">
                {t("conversationIdLabel")}: <span className="font-mono">{result.conversationId}</span>
              </p>
              <p className="text-xs">
                {t("stateLabel")}: {result.state}
              </p>
            </AlertDescription>
          </Alert>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            {t("newB2cPayout")}
          </Button>
        </div>
      )}
    </div>
  );
}
