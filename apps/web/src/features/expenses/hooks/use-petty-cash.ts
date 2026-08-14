"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFloatDto, FloatResponseDto, PettyCashVoucherResponseDto, ReplenishmentResponseDto, SpendDto, UpdateFloatCeilingDto } from "@klickit/contracts";
import {
  approveReplenishment,
  createFloat,
  executeReplenishment,
  getFloat,
  listFloats,
  listFloatVouchers,
  listReplenishments,
  rejectReplenishment,
  requestReplenishment,
  spend,
  updateFloatCeiling,
} from "../api/petty-cash.api";

/** `["expenses", "petty-cash"]` — namespaced under the shared `"expenses"` feature root alongside `EXPENSE_CATEGORIES_QUERY_KEY`/`EXPENSE_VOUCHERS_QUERY_KEY` (Part 1), the same per-sub-domain-namespaced-under-one-root pattern `features/accounting/`/`features/procurement/`/`features/inventory/` already established. Floats/vouchers/replenishments each get their own sub-key. */
export const PETTY_CASH_QUERY_KEY = ["expenses", "petty-cash"] as const;

function floatListKey() {
  return [...PETTY_CASH_QUERY_KEY, "floats", "list"] as const;
}

function floatDetailKey(id: string | undefined) {
  return [...PETTY_CASH_QUERY_KEY, "floats", "detail", id] as const;
}

function voucherListKey(floatId: string | undefined) {
  return [...PETTY_CASH_QUERY_KEY, "floats", floatId, "vouchers"] as const;
}

function replenishmentListKey(floatId: string | undefined) {
  return [...PETTY_CASH_QUERY_KEY, "floats", floatId, "replenishments"] as const;
}

/** `expenses:petty-cash:manage`-gated. */
export function useFloats() {
  return useQuery({ queryKey: floatListKey(), queryFn: () => listFloats() });
}

export function useFloat(id: string | undefined) {
  return useQuery({ queryKey: floatDetailKey(id), queryFn: () => getFloat(id as string), enabled: !!id });
}

/** `expenses:petty-cash:manage`-gated. */
export function useFloatVouchers(floatId: string | undefined) {
  return useQuery({ queryKey: voucherListKey(floatId), queryFn: () => listFloatVouchers(floatId as string), enabled: !!floatId });
}

/** `expenses:petty-cash:manage`-gated. */
export function useReplenishments(floatId: string | undefined) {
  return useQuery({ queryKey: replenishmentListKey(floatId), queryFn: () => listReplenishments(floatId as string), enabled: !!floatId });
}

function invalidateFloatQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: floatListKey() });
  if (id) queryClient.invalidateQueries({ queryKey: floatDetailKey(id) });
}

/** `expenses:petty-cash:manage`-gated. */
export function useCreateFloat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFloatDto) => createFloat(dto),
    onSuccess: () => invalidateFloatQueries(queryClient),
  });
}

/** `expenses:petty-cash:manage`-gated. Server rejects with a real 422 if `ceiling` would fall below the float's current `balance` — see `petty-cash.api.ts`'s own doc comment; the caller (`<UpdateCeilingDialog>`) surfaces that message verbatim. */
export function useUpdateFloatCeiling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFloatCeilingDto }) => updateFloatCeiling(id, dto),
    onSuccess: (updated) => invalidateFloatQueries(queryClient, updated.id),
  });
}

/**
 * `expenses:petty-cash:spend`-gated. Instant, always `APPROVED` — no
 * status-workflow mutation exists for a petty-cash voucher (see
 * `petty-cash.api.ts`'s own doc comment). Invalidates the float's own detail
 * (balance decreased) AND its voucher list.
 */
export function useSpend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ floatId, dto }: { floatId: string; dto: SpendDto }) => spend(floatId, dto),
    onSuccess: (voucher) => {
      invalidateFloatQueries(queryClient, voucher.floatId);
      queryClient.invalidateQueries({ queryKey: voucherListKey(voucher.floatId) });
    },
  });
}

/** `expenses:petty-cash:replenish-request`-gated. No request body — see `petty-cash.api.ts`'s own doc comment. Invalidates the float's replenishment list (a new PENDING_APPROVAL row appears) — the float's own balance/vouchers are untouched by a REQUEST (only `execute()` moves money). */
export function useRequestReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (floatId: string) => requestReplenishment(floatId),
    onSuccess: (replenishment) => {
      queryClient.invalidateQueries({ queryKey: replenishmentListKey(replenishment.floatId) });
    },
  });
}

/** `expenses:petty-cash:replenish-decide`-gated. */
export function useApproveReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReplenishment(id),
    onSuccess: (replenishment) => {
      queryClient.invalidateQueries({ queryKey: replenishmentListKey(replenishment.floatId) });
    },
  });
}

/** `expenses:petty-cash:replenish-decide`-gated. **The row is hard-deleted on the server** — see `petty-cash.api.ts`'s own doc comment on `rejectReplenishment()`. Invalidating the list re-fetches it and the rejected row simply won't be present anymore; no client-side removal trick needed. */
export function useRejectReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectReplenishment(id),
    onSuccess: (replenishment) => {
      queryClient.invalidateQueries({ queryKey: replenishmentListKey(replenishment.floatId) });
    },
  });
}

/** `expenses:petty-cash:replenish-execute`-gated. **The only mutation that changes the float's own `balance`** (P-26 posts, `balance` restored toward `ceiling`) — invalidates the float's detail query in addition to the replenishment list, so a detail-page caller re-fetches the updated balance automatically. */
export function useExecuteReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => executeReplenishment(id),
    onSuccess: (replenishment) => {
      queryClient.invalidateQueries({ queryKey: replenishmentListKey(replenishment.floatId) });
      invalidateFloatQueries(queryClient, replenishment.floatId);
    },
  });
}

export type { FloatResponseDto, PettyCashVoucherResponseDto, ReplenishmentResponseDto };
export { REPLENISHMENT_STATUSES, type PettyCashVoucherStatus, type ReplenishmentStatus } from "../api/petty-cash.api";
