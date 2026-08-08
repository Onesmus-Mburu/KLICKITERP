"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BounceChequeDto } from "@klickit/contracts";
import { bounceCheque, clearCheque, getCheque, listUnclearedCheques } from "../api/cheques.api";

export const CHEQUES_QUERY_KEY = ["payments", "cheques"] as const;

function unclearedKey() {
  return [...CHEQUES_QUERY_KEY, "uncleared"] as const;
}
function detailKey(id: string | undefined) {
  return [...CHEQUES_QUERY_KEY, "detail", id] as const;
}

/** `GET /payments/cheques` — the uncleared queue. Bare unbounded array, no server-side pagination on `ChequesController.listUncleared()` (confirmed by reading it), so client-side `<DataTable>` pagination is the right fit — the plan's own explicit note that none of this slice's 4 controllers paginate server-side. */
export function useUnclearedCheques() {
  return useQuery({ queryKey: unclearedKey(), queryFn: listUnclearedCheques });
}

export function useCheque(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getCheque(id as string), enabled: !!id });
}

/** Clearing a cheque only ever changes that one row's `status` — a plain flip, no cross-feature GL/ledger effect (unlike bounce below), so only the uncleared list + this cheque's own detail need invalidating. */
export function useClearCheque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearCheque(id),
    onSuccess: (cheque) => {
      queryClient.invalidateQueries({ queryKey: unclearedKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(cheque.id) });
    },
  });
}

/**
 * Bouncing a cheque genuinely reaches beyond `pay_cheque` itself — a real GL
 * journal (narrow reversal or full `reverseReceipt()`, per
 * `ChequesService.bounce()`'s own doc comment) and, when `applyBounceFee` is
 * set, a real ADHOC invoice against the student — but this slice's frontend
 * has no per-student invoice/ledger query mounted from the cheques screen
 * itself (unlike the receipt capture/reversal flows, which are always
 * reached FROM a student context). Invalidating the uncleared list + this
 * cheque's own detail is therefore the real, complete set of THIS screen's
 * own caches; a bounced student's own ledger/invoices list (if the cashier
 * happens to have it open in another tab) picks up the change on its own
 * next natural refetch, same as any other cross-tab staleness this app
 * doesn't attempt to solve with cross-tab invalidation anywhere else.
 */
export function useBounceCheque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: BounceChequeDto }) => bounceCheque(id, dto),
    onSuccess: (cheque) => {
      queryClient.invalidateQueries({ queryKey: unclearedKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(cheque.id) });
    },
  });
}
