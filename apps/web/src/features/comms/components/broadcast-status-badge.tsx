"use client";

import { useTranslations } from "next-intl";
import type { BroadcastResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `comm_broadcast.status`'s 6 real values (`comm-broadcast.entity.ts`) — same soft-tint badge convention `InstanceStatusBadge` (Approvals)/`ThemeResponseDto`'s own status badge already establish. `SENDING` reuses the same "in progress" tone as `PENDING_APPROVAL` (both are transient, non-final states), not a 6th distinct color. */
const BROADCAST_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  SENDING: "soft-warning",
  SENT: "soft-success",
  CANCELLED: "soft-destructive",
};

export function BroadcastStatusBadge({ status }: { status: BroadcastResponseDto["status"] }) {
  const t = useTranslations("communications.broadcasts.statusValues");
  return <Badge variant={BROADCAST_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
