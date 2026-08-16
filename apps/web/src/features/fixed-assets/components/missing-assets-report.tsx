"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAssets } from "../hooks/use-assets";
import { CreateDisposalDialog } from "./create-disposal-dialog";

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — the payoff for Part
 * 4's own forward-looking `initialAssetId`/`initialMethod` props: once
 * `post()` returns a non-empty `missingAssetIds` array (every `found=false`
 * line at post time — a plain write-off-PROPOSAL report, confirmed by
 * reading `VerificationService.post()`'s own doc comment directly, NOT an
 * automatic disposal), this component renders each one as a real, actionable
 * row.
 *
 * Each id resolves to a real `code — name` label via Part 1's own
 * `useAssets()` (a single full-list fetch, mapped by id — the same
 * cheaper-than-per-row cross-feature-read-for-display precedent
 * `disposals/page.tsx` already establishes), falling back to the raw id
 * while loading or on a resolution failure.
 *
 * **"Propose write-off" opens Part 4's OWN `<CreateDisposalDialog>` directly
 * — no new disposal-creation UI was built for this** (per this part's own
 * task brief's explicit instruction), pre-filled via that dialog's own
 * `initialAssetId`/`initialMethod: "WRITE_OFF"` props (built in Part 4
 * specifically anticipating this exact reuse) and a custom `trigger` node
 * (a further small, additive prop this part added to that same file — see
 * its own doc comment) so each row reads "Propose write-off," not the
 * dialog's own default "New Disposal" repeated once per row.
 */
export function MissingAssetsReport({ missingAssetIds }: { missingAssetIds: string[] }) {
  const t = useTranslations("fixedAssets.verifications.missingAssetsReport");
  const assetsQuery = useAssets();
  const assetById = React.useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a])), [assetsQuery.data]);

  if (missingAssetIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("noneFound")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>{t("proposalNotAutomaticNotice")}</AlertDescription>
        </Alert>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.asset")}</TableHead>
                <TableHead className="w-48">{t("columns.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missingAssetIds.map((assetId) => {
                const asset = assetById.get(assetId);
                const label = asset ? `${asset.code} — ${asset.name}` : assetId;
                return (
                  <TableRow key={assetId}>
                    <TableCell>{label}</TableCell>
                    <TableCell>
                      <CreateDisposalDialog
                        initialAssetId={assetId}
                        initialMethod="WRITE_OFF"
                        trigger={
                          <Button type="button" variant="outline" size="sm">
                            {t("proposeWriteOffButton")}
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
