"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `BillFeeStructureStatus` (`DRAFT`/`PUBLISHED`/`SUPERSEDED`, `bill-fee-structure.entity.ts`) — same soft-tint badge convention `STATUS_BADGE_VARIANT` (students module) established. */
const FEE_STRUCTURE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PUBLISHED: "soft-success",
  SUPERSEDED: "soft-destructive",
};

export function FeeStructureStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.feeStructures.statusValues");
  return <Badge variant={FEE_STRUCTURE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

/** `BillInvoiceStatus` (`bill-invoice.entity.ts`) — this slice only drives DRAFT->POSTED->VOID (generate/post/void); PENDING_APPROVAL/APPROVED/PARTIALLY_PAID/PAID are real statuses this module can still observe (e.g. from prior test fixtures or a future payments-integration slice) so they're all labeled, not just the three this slice's own flow produces. */
const INVOICE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-warning",
  POSTED: "soft-primary",
  PARTIALLY_PAID: "soft-warning",
  PAID: "soft-success",
  VOID: "soft-destructive",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.invoices.statusValues");
  return <Badge variant={INVOICE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
