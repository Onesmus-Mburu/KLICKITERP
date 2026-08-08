"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useSuspenseItem } from "@/features/payments/hooks/use-suspense";
import { SuspenseStateBadge } from "@/features/payments/components/payment-status-badges";
import { MatchSuspenseDialog } from "@/features/payments/components/match-suspense-dialog";
import { SuspenseRefundPanel } from "@/features/payments/components/suspense-refund-panel";
import type { SuspenseItem } from "@/features/payments/types";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * The new `GET /payments/suspense/{id}` route this slice adds — a resolved
 * (MATCHED/REFUNDED) item's only reachable detail view once it has scrolled
 * off the OPEN-only list, and the deep-link target `<EntityLabel>`'s new
 * `pay_suspense_item` branch and `<SuspenseRefundPanel>`'s own "View
 * request" link both point at.
 */
function SuspenseDetail({ item }: { item: SuspenseItem }) {
  const t = useTranslations("payments.suspense");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("detailTitle")}</h1>
          <SuspenseStateBadge state={item.state} />
        </div>
        {item.state === "OPEN" && <MatchSuspenseDialog item={item} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileRow label={t("source")} value={item.source} />
          <ProfileRow label={t("amount")} value={<span className="font-semibold">{formatMoney(item.amount)}</span>} />
          <ProfileRow label={t("externalRef")} value={item.externalRef} />
          <ProfileRow label={t("receivedAt")} value={new Date(item.receivedAt).toLocaleString()} />
          {item.resolvedAt && <ProfileRow label={t("resolvedAt")} value={new Date(item.resolvedAt).toLocaleString()} />}
          {item.resolutionNote && <ProfileRow label={t("resolutionNote")} value={item.resolutionNote} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("refundTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SuspenseRefundPanel item={item} />
        </CardContent>
      </Card>
    </>
  );
}

export default function SuspenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payments.suspense");
  const itemQuery = useSuspenseItem(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments/suspense">
          <ArrowLeft className="size-4" />
          {t("backToSuspense")}
        </Link>
      </Button>

      <QueryBoundary query={itemQuery}>{(item) => <SuspenseDetail item={item} />}</QueryBoundary>
    </div>
  );
}
