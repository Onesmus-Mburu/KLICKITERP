"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/** The same soft-tint badge convention `features/payments/components/payment-status-badges.tsx` establishes — `isEnabled`/`lastTestOk` are plain booleans (`lastTestOk` also legitimately `null`, "never tested yet"), not a string enum, so these two components branch directly rather than keying off a lookup map. */
export function IntegrationEnabledBadge({ isEnabled }: { isEnabled: boolean }) {
  const t = useTranslations("settings.integrations");
  return <Badge variant={isEnabled ? "soft-success" : "soft-secondary"}>{isEnabled ? t("enabled") : t("disabled")}</Badge>;
}

export function IntegrationLastTestBadge({ lastTestOk }: { lastTestOk: boolean | null }) {
  const t = useTranslations("settings.integrations");
  if (lastTestOk === null) return <Badge variant="outline">{t("neverTested")}</Badge>;
  return <Badge variant={lastTestOk ? "soft-success" : "soft-destructive"}>{lastTestOk ? t("lastTestOk") : t("lastTestFailed")}</Badge>;
}
