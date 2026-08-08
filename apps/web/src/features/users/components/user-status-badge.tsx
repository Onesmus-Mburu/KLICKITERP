"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `UsrUserStatus` (`INVITED`/`ACTIVE`/`SUSPENDED`/`DEACTIVATED`) — same soft-tint badge convention `WalletStatusBadge`/`InvoiceStatusBadge` already established. */
const USER_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  INVITED: "soft-secondary",
  ACTIVE: "soft-success",
  SUSPENDED: "soft-warning",
  DEACTIVATED: "soft-destructive",
};

export function UserStatusBadge({ status }: { status: string }) {
  const t = useTranslations("users.status");
  return <Badge variant={USER_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
