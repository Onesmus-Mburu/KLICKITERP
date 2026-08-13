"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Star } from "lucide-react";
import type { SupplierResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-error";
import { useComputeSupplierRating, useSetManualRating } from "../hooks/use-suppliers";

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — FR-PROC-011.1's three
 * ratings, shown honestly (all `string | null` NUMERIC(3,2) scores, per
 * `SupplierResponseDto`):
 *
 * - `ratingDelivery` — **permanently `null`, always**. NOT a loading state,
 *   NOT "not computed yet" — a real, confirmed, PERMANENT backend gap:
 *   `SupplierRatingsService`'s own doc comment (read directly before
 *   building this) confirms no `expected_delivery_date`-shaped column
 *   exists anywhere in Procurement to compute on-time-delivery from, and
 *   `computeAutoMetrics()` never touches this field at all — there is no
 *   route, present or future-planned in this slice, that could ever
 *   populate it. Shown as an explicit "not available" message with a
 *   one-line honest explanation, never a blank cell (which would read as a
 *   bug) or a spinner (which would falsely imply it's pending).
 * - `ratingQuality` — genuinely computed server-side from GRN
 *   rejection-rate data (`Σrejected/Σreceived` across every GRN line ever
 *   raised against this supplier). Read-only here, with a "Recompute"
 *   button hitting `POST .../ratings/compute`. **A supplier with zero GRN
 *   history leaves this field UNCHANGED, not reset to `null`/`0`**
 *   (confirmed by reading `computeAutoMetrics()` directly: the update only
 *   happens inside `if (!sumReceivedQty.isZero())`) — live-verified in
 *   docs/phase-6/PROGRESS.md's Slice 18 Part 1 section, not just read in
 *   source.
 * - `ratingManual` — a real, editable 1-5 score (`SetManualRatingDto.score`,
 *   `@IsNumber() @Min(1) @Max(5)` — a plain number, not necessarily an
 *   integer, so a `step="0.5"` numeric input is offered rather than an
 *   integer-only star-picker, matching the real validation rule instead of
 *   inventing a coarser one).
 */
export function SupplierRatingsPanel({ supplier }: { supplier: SupplierResponseDto }) {
  const t = useTranslations("procurement.suppliers.ratings");
  const [manualScore, setManualScore] = React.useState(supplier.ratingManual ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const computeMutation = useComputeSupplierRating();
  const setManualMutation = useSetManualRating();

  React.useEffect(() => {
    setManualScore(supplier.ratingManual ?? "");
  }, [supplier.ratingManual]);

  async function handleCompute() {
    setError(null);
    try {
      await computeMutation.mutateAsync(supplier.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const parsedManualScore = Number(manualScore);
  const manualScoreValid = manualScore.trim() !== "" && Number.isFinite(parsedManualScore) && parsedManualScore >= 1 && parsedManualScore <= 5;

  async function handleSetManual() {
    if (!manualScoreValid) return;
    setError(null);
    try {
      await setManualMutation.mutateAsync({ id: supplier.id, score: parsedManualScore });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("deliveryLabel")}</p>
            <p className="text-sm font-medium text-muted-foreground">{t("deliveryUnavailable")}</p>
            <p className="text-xs text-muted-foreground">{t("deliveryUnavailableHint")}</p>
          </div>

          <div className="space-y-1.5 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("qualityLabel")}</p>
            <p className="text-2xl font-semibold text-foreground">{supplier.ratingQuality ?? t("noRatingYet")}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleCompute()} disabled={computeMutation.isPending}>
              <RefreshCw className="size-4" />
              {computeMutation.isPending ? t("computing") : t("recomputeButton")}
            </Button>
          </div>

          <div className="space-y-1.5 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("manualLabel")}</p>
            <p className="text-2xl font-semibold text-foreground">{supplier.ratingManual ?? t("noRatingYet")}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={5}
                step="0.5"
                className="w-20"
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleSetManual()}
                disabled={!manualScoreValid || setManualMutation.isPending}
              >
                <Star className="size-4" />
                {setManualMutation.isPending ? t("saving") : t("setButton")}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
