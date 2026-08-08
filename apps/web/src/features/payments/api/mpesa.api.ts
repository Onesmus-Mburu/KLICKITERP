import type { InitiateB2cDto, InitiateStkDto, MpesaTransactionResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `MpesaController`'s AUTHENTICATED endpoints
 * (`packages/server/src/domains/payments/api/mpesa.controller.ts`) —
 * `payments:mpesa:initiate`. The controller's other four endpoints
 * (`/callbacks/mpesa/*`) are `@Public()` Daraja-inbound webhooks, never
 * called from this app.
 *
 * Phase 6 Slice 9 (Part A) added a real read surface for M-Pesa transactions
 * — `getMpesaTransaction()`/`queryMpesaStatus()` below, backing
 * `<StkStatusPanel>`'s live polling. Before this, no such surface existed at
 * all (confirmed by reading `mpesa.controller.ts` in full at the time) —
 * `StkInitiateForm` worked around the gap with a manual "check the student's
 * receipts for a matching MPESA_STK split" scan. That workaround (formerly
 * `checkForStkReceipt()`/`useCheckForStkReceipt()` here and in
 * `hooks/use-mpesa.ts`) is REMOVED, not left dead alongside the real status
 * endpoint — it had exactly one caller (`StkInitiateForm`), which now uses
 * `<StkStatusPanel>` instead; B2C payouts still have no status endpoint
 * (genuinely out of this dispatch's scope) but never used this STK-specific,
 * `method:"MPESA_STK"`-filtered workaround either, so nothing else regresses.
 */
export async function initiateStk(dto: InitiateStkDto): Promise<MpesaTransactionResponseDto> {
  return unwrapApiResult<MpesaTransactionResponseDto>(await apiClient.POST("/api/v1/payments/mpesa/stk", { body: dto }));
}

export async function initiateB2c(dto: InitiateB2cDto): Promise<MpesaTransactionResponseDto> {
  return unwrapApiResult<MpesaTransactionResponseDto>(await apiClient.POST("/api/v1/payments/mpesa/b2c", { body: dto }));
}

/** `GET payments/mpesa/{id}` — backs `<StkStatusPanel>`'s poll (`useMpesaTransaction()`, `features/payments/hooks/use-mpesa.ts`). */
export async function getMpesaTransaction(id: string): Promise<MpesaTransactionResponseDto> {
  return unwrapApiResult<MpesaTransactionResponseDto>(
    await apiClient.GET("/api/v1/payments/mpesa/{id}", { params: { path: { id } } }),
  );
}

/** `POST payments/mpesa/{id}/query-status` — a real Daraja status-query fallback (`MpesaService.queryPendingStatus()`), the "Check now" trigger's bypass-the-poll-interval nudge. */
export async function queryMpesaStatus(id: string): Promise<MpesaTransactionResponseDto> {
  return unwrapApiResult<MpesaTransactionResponseDto>(
    await apiClient.POST("/api/v1/payments/mpesa/{id}/query-status", { params: { path: { id } } }),
  );
}
