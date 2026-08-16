"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { FaVerificationLineResponseDto, FaVerificationResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAssets } from "@/features/fixed-assets/hooks/use-assets";
import { MissingAssetsReport } from "@/features/fixed-assets/components/missing-assets-report";
import { VerificationLinesRecorder } from "@/features/fixed-assets/components/verification-lines-recorder";
import { VerificationStatusActions, VerificationStatusBadge } from "@/features/fixed-assets/components/verification-status-actions";
import { useVerification, useVerificationLines } from "@/features/fixed-assets/hooks/use-verifications";

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — THE FINAL new route of
 * this whole slice. A verification session's detail page: header card
 * (number, status, snapshot timestamp, approval ref, journal — always
 * `null`, see below) + `<VerificationStatusActions>` (submit/decide/post) +
 * `<VerificationLinesRecorder>` (the per-line found/condition/notes UI +
 * progress indicator) + `<MissingAssetsReport>` once posted. Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape every
 * other detail page in this codebase establishes.
 *
 * **`missingAssetIds` is derived client-side from `lines`, NOT read from the
 * ephemeral `post()` mutation response** — a deliberate, important choice:
 * `PostFaVerificationResponseDto.missingAssetIds` is only ever returned in
 * the ONE HTTP response of the `post()` call itself; it is never persisted
 * anywhere on `fa_verification` (`FaVerificationResponseDto` carries no such
 * field, confirmed by reading `verification.dto.ts` directly), so relying on
 * that mutation's own in-memory result would silently lose the report on any
 * page reload/re-navigation after posting. Instead, once `status === "POSTED"`,
 * this page recomputes the IDENTICAL list directly from the already-fetched
 * `lines` query (`lines.filter(l => !l.found).map(l => l.assetId)`) — this is
 * provably the same set `VerificationService.post()` itself computes
 * (confirmed by reading it directly: it iterates the same `lines`, and
 * neither `found` nor `notes` is ever mutated by any later code path), so
 * this derivation is exact, not an approximation, and survives reloads.
 */
export default function VerificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("fixedAssets.verifications.detail");
  const verificationQuery = useVerification(id);
  const linesQuery = useVerificationLines(id);
  const assetsQuery = useAssets();

  const assetLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assetsQuery.data ?? []) map.set(asset.id, `${asset.code} — ${asset.name}`);
    return map;
  }, [assetsQuery.data]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/fixed-assets/verifications">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={verificationQuery}>
        {(verification) => (
          <VerificationDetailContent verification={verification} lines={linesQuery.data} linesLoading={linesQuery.isLoading} assetLabelById={assetLabelById} />
        )}
      </QueryBoundary>
    </div>
  );
}

function VerificationDetailContent({
  verification,
  lines,
  linesLoading,
  assetLabelById,
}: {
  verification: FaVerificationResponseDto;
  lines: FaVerificationLineResponseDto[] | undefined;
  linesLoading: boolean;
  assetLabelById: Map<string, string>;
}) {
  const t = useTranslations("fixedAssets.verifications.detail");

  const missingAssetIds = React.useMemo(
    () => (verification.status === "POSTED" ? (lines ?? []).filter((l) => !l.found).map((l) => l.assetId) : []),
    [verification.status, lines],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{verification.number}</CardTitle>
              <VerificationStatusBadge status={verification.status} />
            </div>
            <CardDescription>{t("snapshotAtPrefix")} {new Date(verification.snapshotAt).toLocaleString()}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DetailField label={t("statusLabel")} value={<VerificationStatusBadge status={verification.status} />} />
            <DetailField label={t("approvalRefLabel")} value={verification.approvalRef ?? t("approvalRefNone")} />
            <DetailField label={t("journalLabel")} value={t("journalNeverPosted")} />
          </dl>
          <VerificationStatusActions verification={verification} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
          <CardDescription>{t("linesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {linesLoading || !lines ? (
            <p className="text-sm text-muted-foreground">{t("loadingLines")}</p>
          ) : (
            <VerificationLinesRecorder verificationId={verification.id} status={verification.status} lines={lines} assetLabelById={assetLabelById} />
          )}
        </CardContent>
      </Card>

      {verification.status === "POSTED" && <MissingAssetsReport missingAssetIds={missingAssetIds} />}
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
