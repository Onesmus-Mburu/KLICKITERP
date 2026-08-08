"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function SyncLogStatusBadge({ status }: { status: string }) {
  const t = useTranslations("settings.accountingSync.statuses");
  return <Badge variant={status === "SUCCESS" ? "soft-success" : "soft-destructive"}>{t(status)}</Badge>;
}
