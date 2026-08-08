"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { WebhookDeliveryStatus } from "../api/webhook-deliveries.api";

const VARIANT_BY_STATUS: Record<WebhookDeliveryStatus, "soft-secondary" | "soft-success" | "soft-warning" | "soft-destructive"> = {
  PENDING: "soft-secondary",
  DELIVERED: "soft-success",
  FAILED: "soft-warning",
  DEAD: "soft-destructive",
};

export function WebhookDeliveryStatusBadge({ status }: { status: string }) {
  const t = useTranslations("settings.webhooks.deliveries.statuses");
  const variant = VARIANT_BY_STATUS[status as WebhookDeliveryStatus] ?? "soft-secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}
