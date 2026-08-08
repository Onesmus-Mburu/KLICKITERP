"use client";

import { useTranslations } from "next-intl";
import type { ThemeResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * `BrndThemeStatus` (`DRAFT`/`PUBLISHED`/`ARCHIVED`) — same soft-tint badge
 * convention `UserStatusBadge`/`TermBillingLockToggle` already establish.
 * Nothing is publish-able yet in this part (Part 2's own scope), so `DRAFT`
 * is the only status this screen's list can actually render live today —
 * `PUBLISHED`/`ARCHIVED` are still mapped correctly here regardless, just
 * unreachable via this part's own UI.
 */
const THEME_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PUBLISHED: "soft-success",
  ARCHIVED: "outline",
};

export function ThemeStatusBadge({ status }: { status: ThemeResponseDto["status"] }) {
  const t = useTranslations("branding.status");
  return <Badge variant={THEME_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
