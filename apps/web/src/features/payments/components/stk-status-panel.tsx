"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MpesaTransactionResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useMpesaTransaction, useQueryMpesaStatus } from "../hooks/use-mpesa";

/** `PayMpesaTransactionState` values a callback (real or query-status) can no longer move past — mirrors `MpesaService`'s own `TERMINAL_STATES` constant (`packages/server/.../mpesa.service.ts`), hand-duplicated per this codebase's established "apps/web has no dependency on packages/server" convention (see `features/payments/constants.ts`). */
const TERMINAL_STATES = new Set(["CONFIRMED", "FAILED", "TIMEOUT", "REVERSED"]);
/** Matches a real STK prompt's practical expiry window (Daraja's own prompt times out well before this in practice, but this is the plan's own chosen "give the customer a real chance to enter their PIN" cooldown before offering a fresh push). */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Phase 6 Slice 9 (Part A) — the shared live-status panel for an in-flight
 * M-Pesa STK push, mounted in two places: `SplitRow`'s new `MPESA_STK`
 * branch (`collect-fees-flow.tsx`) and `StkInitiateForm`'s post-initiate view
 * (replacing its old manual "check for the resulting receipt" button now
 * that a real status endpoint exists).
 *
 * Polls `GET payments/mpesa/:id` (`useMpesaTransaction()`,
 * `refetchInterval` active only while `INITIATED`/`PENDING`, auto-stopping on
 * any terminal state) and renders one of three states:
 * - **waiting** (`INITIATED`/`PENDING`): the transaction's own checkout
 *   request id/state, a live ~60s countdown during which "Resend" is
 *   disabled, and a "Check now" button that bypasses the poll interval for an
 *   immediate real Daraja status-query nudge (`POST .../query-status`).
 * - **CONFIRMED**: a success state with a real link to
 *   `/payments/receipts/{matchedReceiptId}`.
 * - **FAILED/TIMEOUT/REVERSED**: a clear failure state, "Resend" enabled
 *   immediately (no countdown to wait out on an already-dead transaction).
 *
 * "Resend" is NOT a retry of the same `checkoutRequestId` — Safaricom STK
 * prompts are single-use, there is no real "resend the same one". It calls
 * the caller-supplied `onResend()`, which is expected to perform a fresh
 * `initiateStk()` with the same amount/msisdn/student/`invoiceIds` and
 * return the new transaction; this panel then re-points itself at the new id
 * and restarts its own countdown, exactly as if it had just been mounted for
 * the first time.
 */
export function StkStatusPanel({
  transaction,
  onResend,
}: {
  transaction: MpesaTransactionResponseDto;
  onResend: () => Promise<MpesaTransactionResponseDto>;
}) {
  const t = useTranslations("payments.stkStatus");
  const [activeId, setActiveId] = React.useState(transaction.id);
  const [initiatedAt, setInitiatedAt] = React.useState(() => Date.now());
  const [remainingSeconds, setRemainingSeconds] = React.useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const statusQuery = useMpesaTransaction(activeId, {
    initialData: activeId === transaction.id ? transaction : undefined,
  });
  const checkNowMutation = useQueryMpesaStatus();

  const current = statusQuery.data ?? transaction;
  const isTerminal = TERMINAL_STATES.has(current.state);
  const isConfirmed = current.state === "CONFIRMED";
  const isFailedLike = isTerminal && !isConfirmed;

  // Live countdown — ticks every second until either 60s has elapsed since
  // `initiatedAt` (this transaction's own initiation or the last resend) or
  // the transaction reaches a terminal state, whichever comes first.
  React.useEffect(() => {
    if (isTerminal) return;
    const tick = () => setRemainingSeconds(Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - initiatedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [initiatedAt, isTerminal]);

  async function handleCheckNow() {
    setActionError(null);
    try {
      await checkNowMutation.mutateAsync(activeId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleResend() {
    setActionError(null);
    setIsResending(true);
    try {
      const fresh = await onResend();
      setActiveId(fresh.id);
      setInitiatedAt(Date.now());
      setRemainingSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setIsResending(false);
    }
  }

  const resendDisabled = isResending || isConfirmed || (!isTerminal && remainingSeconds > 0);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {isConfirmed ? (
        <Alert variant="success">
          <AlertDescription className="space-y-1">
            <p>{t("confirmedDescription", { amount: formatMoney(current.amount) })}</p>
            {current.matchedReceiptId && (
              <Link href={`/payments/receipts/${current.matchedReceiptId}`} className="text-sm text-primary hover:underline">
                {t("viewReceipt")}
              </Link>
            )}
          </AlertDescription>
        </Alert>
      ) : isFailedLike ? (
        <Alert variant="destructive">
          <AlertDescription>{t("failedDescription", { state: current.state })}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription className="space-y-1">
            <p>{t("waitingDescription", { amount: formatMoney(current.amount) })}</p>
            <p className="text-xs">
              {t("checkoutRequestIdLabel")}: <span className="font-mono">{current.checkoutRequestId}</span>
            </p>
            <p className="text-xs">
              {t("stateLabel")}: {current.state}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!isTerminal && (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCheckNow()} disabled={checkNowMutation.isPending}>
            {checkNowMutation.isPending ? t("checking") : t("checkNow")}
          </Button>
        )}
        {!isConfirmed && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleResend()} disabled={resendDisabled}>
            {isResending ? t("resending") : t("resend")}
          </Button>
        )}
        {!isTerminal && remainingSeconds > 0 && (
          <span className="text-xs text-muted-foreground">{t("resendCountdown", { seconds: remainingSeconds })}</span>
        )}
      </div>
    </div>
  );
}
