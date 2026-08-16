"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { FaDisposalResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useAsset } from "@/features/fixed-assets/hooks/use-assets";
import { DisposalJournalPreview } from "@/features/fixed-assets/components/disposal-journal-preview";
import { DisposalStatusActions, DisposalStatusBadge } from "@/features/fixed-assets/components/disposal-status-actions";
import { useDisposal } from "@/features/fixed-assets/hooks/use-disposals";

const ASSET_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  UNDER_MAINTENANCE: "soft-warning",
  TRANSFERRED: "soft-secondary",
  DISPOSED: "soft-destructive",
  WRITTEN_OFF: "soft-destructive",
};

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — a disposal's detail
 * page: header card (asset label, method, proceeds, gain/loss, status
 * badge), the lifecycle action cluster (`<DisposalStatusActions>`), and the
 * real/preview P-31 breakdown (`<DisposalJournalPreview>`, always rendered —
 * that component's own doc comment explains how it chooses between the real
 * posted journal and a client-computed preview). Same `useParams<{id:
 * string}>()` + `<QueryBoundary>` header-card shape every other detail page
 * in this codebase establishes.
 *
 * `assetId` resolved to a real `code — name` label (linking to that asset's
 * own detail page) via Part 1's own `useAsset()`.
 *
 * **The method-vs-status distinction note** — per this part's own task
 * brief: a disposal's own `method` (SALE/SCRAP/DONATION/WRITE_OFF) describes
 * WHY the asset left service; the asset's own `status` field only EVER
 * becomes `DISPOSED` once posted, regardless of method (confirmed by reading
 * `post()` directly, `disposal.service.ts:253` — `asset.status` never
 * becomes the separate `WRITTEN_OFF` enum value via any code path in this
 * whole module). Shown as a small permanent caption once the asset's own
 * status is genuinely `DISPOSED`, so a user doesn't expect a `WRITTEN_OFF`
 * asset status to ever appear here even for a `method: "WRITE_OFF"` disposal.
 */
export default function DisposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("fixedAssets.disposals.detail");
  const disposalQuery = useDisposal(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/fixed-assets/disposals">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={disposalQuery}>{(disposal) => <DisposalDetailContent disposal={disposal} />}</QueryBoundary>
    </div>
  );
}

function DisposalDetailContent({ disposal }: { disposal: FaDisposalResponseDto }) {
  const t = useTranslations("fixedAssets.disposals.detail");
  const tMethods = useTranslations("fixedAssets.disposalMethods");
  const tAssetStatuses = useTranslations("fixedAssets.assetStatuses");
  const assetQuery = useAsset(disposal.assetId);
  const asset = assetQuery.data;
  const assetLabel = asset ? `${asset.code} — ${asset.name}` : disposal.assetId;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">
                {t("titlePrefix")} {assetLabel}
              </CardTitle>
              <DisposalStatusBadge status={disposal.status} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailField
              label={t("assetLabel")}
              value={
                <Link href={`/fixed-assets/assets/${disposal.assetId}`} className="text-primary underline">
                  {assetLabel}
                </Link>
              }
            />
            <DetailField label={t("methodLabel")} value={tMethods(disposal.method)} />
            <DetailField label={t("proceedsLabel")} value={formatMoney(disposal.proceeds)} />
            <DetailField label={t("gainLossLabel")} value={disposal.gainLoss ? formatMoney(disposal.gainLoss) : "—"} />
            <DetailField label={t("statusLabel")} value={<DisposalStatusBadge status={disposal.status} />} />
            {asset && (
              <DetailField
                label={t("assetStatusLabel")}
                value={<Badge variant={ASSET_STATUS_BADGE_VARIANT[asset.status] ?? "outline"}>{tAssetStatuses(asset.status)}</Badge>}
              />
            )}
          </dl>
          {asset?.status === "DISPOSED" && <p className="text-xs text-muted-foreground">{t("methodVsStatusNote")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("actionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DisposalStatusActions disposal={disposal} />
        </CardContent>
      </Card>

      <DisposalJournalPreview disposal={disposal} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
