"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { MessageStatus } from "../api/messages.api";

/**
 * `comm_message.status`'s 5 real values (`MESSAGE_STATUSES` in
 * `list-messages-query.dto.ts`/`message-response.dto.ts`) — same soft-tint
 * badge convention `BroadcastStatusBadge`/`ChannelBadge` already establish.
 * `SENT` reuses the same "in flight, not yet confirmed" tone
 * `BroadcastStatusBadge` gives its own `SENDING`/`PENDING_APPROVAL` states
 * (soft-warning) — a message is only genuinely done once `DELIVERED`.
 * `OPTED_OUT` gets its own neutral `outline` tone, distinct from `FAILED`'s
 * destructive one — a recipient opting out isn't a delivery error.
 */
const MESSAGE_STATUS_VARIANT: Record<MessageStatus, NonNullable<BadgeProps["variant"]>> = {
  QUEUED: "soft-secondary",
  SENT: "soft-warning",
  DELIVERED: "soft-success",
  FAILED: "soft-destructive",
  OPTED_OUT: "outline",
};

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const t = useTranslations("communications.messages.statusValues");
  return <Badge variant={MESSAGE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
