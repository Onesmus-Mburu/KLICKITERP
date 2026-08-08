"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `WallWalletStatus` (`ACTIVE`/`LOCKED`/`FROZEN`/`CLOSED`) — same soft-tint badge convention `InvoiceStatusBadge`/`FeeStructureStatusBadge` (billing module) established. */
const WALLET_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  ACTIVE: "soft-success",
  LOCKED: "soft-warning",
  FROZEN: "soft-secondary",
  CLOSED: "soft-destructive",
};

export function WalletStatusBadge({ status }: { status: string }) {
  const t = useTranslations("wallet.status");
  return <Badge variant={WALLET_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
