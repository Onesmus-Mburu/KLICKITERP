"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatchSuspenseItemDto, ReverseSuspenseRefundDto } from "@klickit/contracts";
import { useInstancesForDomain } from "@/features/approvals/hooks/use-instances";
import { PAYMENT_REVERSALS_DOMAIN_CODE } from "../constants";
import { pickLatestInstanceForEntity } from "../lib/reversal";
import { getSuspenseItem, listOpenSuspenseItems, matchSuspenseItem, refundSuspenseItem, requestSuspenseRefund } from "../api/suspense.api";

export const SUSPENSE_QUERY_KEY = ["payments", "suspense"] as const;

function openKey() {
  return [...SUSPENSE_QUERY_KEY, "open"] as const;
}
function detailKey(id: string | undefined) {
  return [...SUSPENSE_QUERY_KEY, "detail", id] as const;
}

export function useOpenSuspenseItems() {
  return useQuery({ queryKey: openKey(), queryFn: listOpenSuspenseItems });
}

export function useSuspenseItem(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getSuspenseItem(id as string), enabled: !!id });
}

/**
 * Matching creates a real, backdated receipt (`SuspenseService.matchToStudent()`
 * delegates to `ReceiptsService.captureReceipt()`) — the SAME three
 * cross-feature invalidations `useCaptureReceipt()`
 * (`use-receipts.ts`) already performs for that reason, plus the open
 * suspense list (the item leaves OPEN -> MATCHED, dropping off it) and its
 * own detail key.
 */
export function useMatchSuspenseItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: MatchSuspenseItemDto) => matchSuspenseItem(id, dto),
    onSuccess: (item, dto) => {
      queryClient.invalidateQueries({ queryKey: openKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["payments", "receipts", "student", dto.studentId] });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", dto.studentId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", "student", dto.studentId] });
      void item;
    },
  });
}

/** The entity-status-resolution use case for suspense refund — the identical shape `use-receipts.ts`'s `useReceiptReversalInstance()` establishes, reused verbatim for `entityType: "pay_suspense_item"` (`pickLatestInstanceForEntity()` filters on `entityId` alone, which is a UUID unique across entity types, so no cross-entity-type collision risk). */
export function useSuspenseRefundInstance(suspenseItemId: string | undefined) {
  const domainQuery = useInstancesForDomain(suspenseItemId ? PAYMENT_REVERSALS_DOMAIN_CODE : undefined);
  const latestInstance = React.useMemo(() => {
    if (!suspenseItemId || !domainQuery.data) return undefined;
    return pickLatestInstanceForEntity(domainQuery.data, suspenseItemId);
  }, [domainQuery.data, suspenseItemId]);

  return { ...domainQuery, latestInstance };
}

export function useRequestSuspenseRefund(suspenseItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestSuspenseRefund(suspenseItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", "instances", "domain", PAYMENT_REVERSALS_DOMAIN_CODE] });
    },
  });
}

/** Executing a refund flips `state` OPEN -> REFUNDED (no receipt/GL/ledger effect — `SuspenseService.refundSuspenseItem()`'s own doc comment: the actual payout is a manual follow-up, out of scope here), so it drops off the open list — invalidate that, this item's own detail, and the reversal-status query. */
export function useRefundSuspenseItem(suspenseItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ReverseSuspenseRefundDto) => refundSuspenseItem(suspenseItemId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: openKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(suspenseItemId) });
      queryClient.invalidateQueries({ queryKey: ["approvals", "instances", "domain", PAYMENT_REVERSALS_DOMAIN_CODE] });
    },
  });
}
