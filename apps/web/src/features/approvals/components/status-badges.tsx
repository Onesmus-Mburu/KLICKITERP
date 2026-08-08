"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `ApprInstanceStatus` (`appr-instance.entity.ts`) — same soft-tint badge convention `FeeStructureStatusBadge`/`InvoiceStatusBadge` (Billing) established. */
const INSTANCE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  PENDING: "soft-warning",
  APPROVED: "soft-success",
  REJECTED: "soft-destructive",
  RETURNED: "soft-secondary",
  CANCELLED: "soft-secondary",
};

export function InstanceStatusBadge({ status }: { status: string }) {
  const t = useTranslations("approvals.statusValues");
  return <Badge variant={INSTANCE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
