"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { MpesaTransactionResponseDto, StudentResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, normalizeMoneyInput } from "@/lib/money";
import { StudentSearchBox } from "./student-search-box";
import { StkStatusPanel } from "./stk-status-panel";
import { useInitiateStk } from "../hooks/use-mpesa";

/**
 * `POST /payments/mpesa/stk` (`payments:mpesa:initiate`) — a real initiate
 * call, not a mock: returns a real `{id, checkoutRequestId, state:"PENDING",...}`
 * (confirmed by reading `MpesaService.initiateStk()` directly — in this dev
 * environment, with no real Daraja integration configured,
 * `MpesaAdapterResolverService` falls back to `MpesaLogOnlyAdapter`, which
 * logs and returns a synthetic `checkoutRequestId` rather than a real
 * Safaricom one; the transaction row and its `PENDING` state are still
 * genuinely real and persisted).
 *
 * Phase 6 Slice 9 (Part A) — the initiate step below (student search,
 * amount, msisdn, accountRef) is UNCHANGED from before; only the
 * post-initiate waiting UI is upgraded, from a manual "check for the
 * resulting receipt" button (worked around the fact that no status endpoint
 * existed) to the real, shared `<StkStatusPanel>` (`GET payments/mpesa/:id`
 * live polling, a real countdown-gated "Resend", and a "Check now" Daraja
 * status-query nudge) now that `MpesaController` exposes one.
 */
export function StkInitiateForm() {
  const t = useTranslations("payments.mpesa.stk");
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResponseDto | null>(null);
  const [amount, setAmount] = React.useState("");
  const [msisdn, setMsisdn] = React.useState("");
  const [accountRef, setAccountRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MpesaTransactionResponseDto | null>(null);

  const initiateMutation = useInitiateStk();

  React.useEffect(() => {
    if (selectedStudent && !accountRef) setAccountRef(selectedStudent.admissionNo);
  }, [selectedStudent, accountRef]);

  async function initiateStkTxn(): Promise<MpesaTransactionResponseDto> {
    if (!selectedStudent) throw new Error(t("studentRequired"));
    const normalizedAmount = normalizeMoneyInput(amount);
    if (!normalizedAmount) throw new Error(t("amountRequired"));
    if (!msisdn.trim()) throw new Error(t("msisdnRequired"));
    if (!accountRef.trim()) throw new Error(t("accountRefRequired"));
    return initiateMutation.mutateAsync({
      studentId: selectedStudent.id,
      amountKes: normalizedAmount,
      msisdn: msisdn.trim(),
      accountRef: accountRef.trim(),
    });
  }

  async function handleSubmit() {
    setError(null);
    try {
      const txn = await initiateStkTxn();
      setResult(txn);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t("genericError"));
    }
  }

  function handleReset() {
    setSelectedStudent(null);
    setAmount("");
    setMsisdn("");
    setAccountRef("");
    setError(null);
    setResult(null);
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!result ? (
        <>
          <div className="space-y-1.5">
            <Label required>{t("student")}</Label>
            <StudentSearchBox selectedStudent={selectedStudent} onSelect={setSelectedStudent} />
          </div>
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
            <Label required>{t("accountRef")}</Label>
            <Input value={accountRef} onChange={(e) => setAccountRef(e.target.value)} maxLength={30} />
            <p className="text-xs text-muted-foreground">{t("accountRefHint")}</p>
          </div>
          <Button type="button" onClick={() => void handleSubmit()} disabled={initiateMutation.isPending}>
            {initiateMutation.isPending ? t("initiating") : t("submit")}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <StkStatusPanel transaction={result} onResend={initiateStkTxn} />

          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            {t("newStkPush")}
          </Button>
        </div>
      )}
    </div>
  );
}
