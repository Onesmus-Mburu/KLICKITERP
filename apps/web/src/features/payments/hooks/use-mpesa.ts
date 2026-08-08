"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InitiateB2cDto, InitiateStkDto, MpesaTransactionResponseDto } from "@klickit/contracts";
import { getMpesaTransaction, initiateB2c, initiateStk, queryMpesaStatus } from "../api/mpesa.api";

export const MPESA_TRANSACTION_QUERY_KEY = ["payments", "mpesa"] as const;

/** `PayMpesaTransactionState` values `MpesaService.handleStkCallback()`'s own `TERMINAL_STATES` constant does NOT include — a live poll only makes sense while the transaction is still open. Mirrored here (not imported — `apps/web` has no dependency on `packages/server`), same precedent `features/payments/constants.ts`'s own hand-mirrored enums document. */
const OPEN_MPESA_STATES = new Set(["INITIATED", "PENDING"]);
const STK_POLL_INTERVAL_MS = 3000;

/** No cache to invalidate here — no read surface exists anywhere for M-Pesa transactions (see `mpesa.api.ts`'s own doc comment) beyond the receipt/ledger/invoice queries the eventual STK callback itself changes, which this frontend has no way to observe happening (it's a Daraja-inbound webhook, not something this initiate call triggers synchronously). */
export function useInitiateStk() {
  return useMutation({ mutationFn: (dto: InitiateStkDto) => initiateStk(dto) });
}

/**
 * Phase 6 Slice 9 (Part A) — `<StkStatusPanel>`'s live poll. `refetchInterval`
 * is a function of the CACHED data's own `state` (react-query v5's
 * `(query) => number|false` form) so polling stops the instant a terminal
 * state lands, without a separate `enabled` flag to keep in sync. `id`
 * undefined disables the query entirely (e.g. before any STK push has been
 * sent yet).
 */
export function useMpesaTransaction(id: string | undefined, options?: { initialData?: MpesaTransactionResponseDto }) {
  return useQuery({
    queryKey: [...MPESA_TRANSACTION_QUERY_KEY, id],
    queryFn: () => getMpesaTransaction(id as string),
    enabled: !!id,
    initialData: options?.initialData,
    refetchInterval: (query) => (query.state.data && OPEN_MPESA_STATES.has(query.state.data.state) ? STK_POLL_INTERVAL_MS : false),
  });
}

/** "Check now" — bypasses the poll interval for an immediate real Daraja status-query nudge (`MpesaService.queryPendingStatus()`). Updates the SAME cache entry `useMpesaTransaction()` reads, so the panel reflects the result instantly rather than waiting for the next poll tick. */
export function useQueryMpesaStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => queryMpesaStatus(id),
    onSuccess: (txn) => {
      queryClient.setQueryData([...MPESA_TRANSACTION_QUERY_KEY, txn.id], txn);
    },
  });
}

export function useInitiateB2c() {
  return useMutation({ mutationFn: (dto: InitiateB2cDto) => initiateB2c(dto) });
}
