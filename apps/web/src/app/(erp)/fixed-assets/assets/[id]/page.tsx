"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { FaAssetResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useUser } from "@/features/users/hooks/use-users";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { usePurchaseOrder } from "@/features/procurement/hooks/use-purchase-orders";
import { useGrn } from "@/features/procurement/hooks/use-grn";
import { useCategory } from "@/features/fixed-assets/hooks/use-categories";
import { useAsset } from "@/features/fixed-assets/hooks/use-assets";
import { EditAssetDialog } from "@/features/fixed-assets/components/edit-asset-dialog";
import { UpdateConditionDialog } from "@/features/fixed-assets/components/update-condition-dialog";
import { TransferPanel } from "@/features/fixed-assets/components/transfer-panel";
import { MaintenancePanel } from "@/features/fixed-assets/components/maintenance-panel";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  UNDER_MAINTENANCE: "soft-warning",
  TRANSFERRED: "soft-secondary",
  DISPOSED: "soft-destructive",
  WRITTEN_OFF: "soft-destructive",
};

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — an asset's
 * detail page: header `Card` (code/name, status badge, `<EditAssetDialog>` +
 * `<UpdateConditionDialog>`) and a details grid — the same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape every
 * other detail page in this codebase establishes.
 *
 * **Foreign ids resolved to human labels where a cheap detail hook already
 * exists** (`categoryId` via this same part's own `useCategory()`,
 * `custodianUserId` via `features/users/hooks/use-users.ts`'s `useUser()`,
 * `supplierId`/`poId`/`grnId` via `features/procurement/`'s own
 * `useSupplier()`/`usePurchaseOrder()`/`useGrn()`) — all cross-feature READ
 * hooks, the same precedent `banking/accounts/[id]/page.tsx` already
 * establishes for its own `glAccountId` resolution (cross-feature reads for
 * DISPLAY are fine; this codebase's "each feature stays self-contained"
 * discipline applies to write paths/comboboxes, not read-only label
 * resolution). Each falls back to the raw id while loading OR if resolution
 * fails (403 — a role with `fixed-assets:asset:view` need not also hold
 * `users:user:view`/`procurement:supplier:view`/etc — or 404), never
 * blocking this page's own primary query on any of these secondary ones.
 *
 * **Parts 3-5 of this slice (Depreciation/Disposal/Verification) are
 * deliberately NOT stubbed here** — no empty placeholder sections, matching
 * Part 1's own precedent; this page shows exactly the real register fields
 * this and prior parts' own backend surface covers.
 *
 * **Phase 6 Slice 23 Part 2 additions**: `<TransferPanel>` (this asset's own
 * `fa_transfer` history — location/custodian handovers, no approval chain —
 * plus "New transfer"/per-row "Acknowledge") and `<MaintenancePanel>` (this
 * asset's own `fa_maintenance` history — planned/repair events — plus
 * "Schedule maintenance"/per-row "Complete"), both rendered as their own
 * sections below the header card, the same "no standalone route — every
 * list route is asset-scoped" shape Payroll Slice 22 Part 3's
 * `employee-assignment-panel.tsx`/`employee-component-overrides-panel.tsx`
 * already established on the employee detail page. Both panels receive
 * `asset.status` as a prop (`assetStatus` below) so each can correctly
 * disable its own create action once the asset is `DISPOSED`/`WRITTEN_OFF`
 * (BR-FA-02) — not reachable yet this slice, Part 4/Disposals will make it
 * reachable, but the condition is wired correctly now per this part's own
 * task brief.
 */
export default function FixedAssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("fixedAssets.assets.detail");
  const assetQuery = useAsset(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/fixed-assets/assets">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={assetQuery}>
        {(asset) => (
          <div className="space-y-6">
            <AssetDetailCard asset={asset} />
            <TransferPanel assetId={asset.id} assetStatus={asset.status} />
            <MaintenancePanel assetId={asset.id} assetStatus={asset.status} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}

function AssetDetailCard({ asset }: { asset: FaAssetResponseDto }) {
  const t = useTranslations("fixedAssets.assets.detail");
  const tStatuses = useTranslations("fixedAssets.assetStatuses");
  const tFundingSources = useTranslations("fixedAssets.fundingSources");

  const categoryQuery = useCategory(asset.categoryId);
  const custodianQuery = useUser(asset.custodianUserId ?? undefined);
  const supplierQuery = useSupplier(asset.supplierId ?? undefined);
  const poQuery = usePurchaseOrder(asset.poId ?? undefined);
  const grnQuery = useGrn(asset.grnId ?? undefined);

  const categoryLabel = categoryQuery.data?.name ?? asset.categoryId;
  const custodianLabel = asset.custodianUserId ? (custodianQuery.data?.fullName ?? asset.custodianUserId) : "—";
  const supplierLabel = asset.supplierId ? (supplierQuery.data?.name ?? asset.supplierId) : "—";
  const poLabel = asset.poId ? (poQuery.data?.number ?? asset.poId) : "—";
  const grnLabel = asset.grnId ? (grnQuery.data?.number ?? asset.grnId) : "—";
  const insuranceNotes = asset.insurance && typeof (asset.insurance as { notes?: unknown }).notes === "string"
    ? ((asset.insurance as { notes: string }).notes)
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">
              {asset.code} — {asset.name}
            </CardTitle>
            <Badge variant={STATUS_BADGE_VARIANT[asset.status] ?? "outline"}>{tStatuses(asset.status)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <UpdateConditionDialog asset={asset} />
          <EditAssetDialog asset={asset} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("categoryLabel")} value={categoryLabel} />
          <Field label={t("serialNoLabel")} value={asset.serialNo ?? "—"} />
          <Field label={t("barcodeLabel")} value={asset.barcode ?? "—"} />
          <Field label={t("locationLabel")} value={asset.location} />
          <Field label={t("custodianLabel")} value={custodianLabel} />
          <Field label={t("conditionLabel")} value={asset.condition} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("acquisitionDateLabel")} value={asset.acquisitionDate} />
          <Field label={t("inServiceFromLabel")} value={asset.inServiceFrom} />
          <Field label={t("fundingSourceLabel")} value={tFundingSources(asset.fundingSource)} />
          <Field label={t("costLabel")} value={formatMoney(asset.cost)} />
          <Field label={t("residualValueLabel")} value={formatMoney(asset.residualValue)} />
          <Field label={t("accumDepreciationLabel")} value={formatMoney(asset.accumDepreciation)} />
          <Field label={t("lifeMonthsOverrideLabel")} value={asset.lifeMonthsOverride != null ? t("monthsValue", { count: asset.lifeMonthsOverride }) : "—"} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("supplierLabel")} value={supplierLabel} />
          <Field label={t("poLabel")} value={poLabel} />
          <Field label={t("grnLabel")} value={grnLabel} />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("insuranceLabel")}</p>
          <p className="text-sm text-foreground">{insuranceNotes ?? t("noInsuranceNotes")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
