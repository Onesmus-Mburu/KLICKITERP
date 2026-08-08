"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/** Same soft-tint badge convention `features/settings/components/integration-status-badges.tsx` establishes for an analogous plain boolean. */
export function WebhookSubscriptionStatusBadge({ isActive }: { isActive: boolean }) {
  const t = useTranslations("settings.webhooks");
  return <Badge variant={isActive ? "soft-success" : "soft-secondary"}>{isActive ? t("statusActive") : t("statusDisabled")}</Badge>;
}
