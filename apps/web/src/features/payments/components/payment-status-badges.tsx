"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * Phase 6 Slice 6 — the same soft-tint badge convention
 * `approvals/components/status-badges.tsx`'s `InstanceStatusBadge` (and
 * Billing's `FeeStructureStatusBadge`/`InvoiceStatusBadge` before it)
 * established, consolidated into one file for the three new status enums
 * this slice adds (`PayChequeStatus`/`PaySuspenseItemState`/
 * `PayMpesaTransactionState`).
 */
const CHEQUE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  UNCLEARED: "soft-warning",
  CLEARED: "soft-success",
  BOUNCED: "soft-destructive",
};

export function ChequeStatusBadge({ status }: { status: string }) {
  const t = useTranslations("payments.cheques.statusValues");
  return <Badge variant={CHEQUE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

const SUSPENSE_STATE_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  OPEN: "soft-warning",
  MATCHED: "soft-success",
  REFUNDED: "soft-secondary",
};

export function SuspenseStateBadge({ state }: { state: string }) {
  const t = useTranslations("payments.suspense.stateValues");
  return <Badge variant={SUSPENSE_STATE_VARIANT[state] ?? "outline"}>{t(state)}</Badge>;
}

const MPESA_STATE_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  INITIATED: "soft-secondary",
  PENDING: "soft-warning",
  CONFIRMED: "soft-success",
  FAILED: "soft-destructive",
  TIMEOUT: "soft-destructive",
  REVERSED: "soft-secondary",
};

export function MpesaStateBadge({ state }: { state: string }) {
  const t = useTranslations("payments.mpesa.stateValues");
  return <Badge variant={MPESA_STATE_VARIANT[state] ?? "outline"}>{t(state)}</Badge>;
}

/**
 * `PayBulkAllocationBatchStatus` — `FAILED` is deliberately NOT rendered as
 * a hard-stop destructive-only signal here: per the plan's own explicit
 * instruction (and `BulkAllocationService.matchAndPost()`'s own doc
 * comment), `status: "FAILED"` fires if ANY line fell through, even if most
 * succeeded — the batch detail page's own `createdReceipts`-vs-`lines.length`
 * summary right next to this badge is what tells the true story, this badge
 * alone is not "everything failed."
 */
const BULK_ALLOCATION_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  MATCHING: "soft-warning",
  COMPLETED: "soft-success",
  FAILED: "soft-destructive",
};

export function BulkAllocationStatusBadge({ status }: { status: string }) {
  const t = useTranslations("payments.bulkAllocations.statusValues");
  return <Badge variant={BULK_ALLOCATION_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
