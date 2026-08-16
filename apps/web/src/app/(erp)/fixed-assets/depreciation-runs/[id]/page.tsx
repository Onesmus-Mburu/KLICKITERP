"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { FaDepreciationRunResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { usePeriod } from "@/features/accounting/hooks/use-periods";
import { useJournal } from "@/features/accounting/hooks/use-journals";
import { DepreciationRunLinesTable } from "@/features/fixed-assets/components/depreciation-run-lines-table";
import { DepreciationRunStatusActions, DepreciationRunStatusBadge } from "@/features/fixed-assets/components/depreciation-run-status-actions";
import { useDepreciationRun } from "@/features/fixed-assets/hooks/use-depreciation-runs";

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — the depreciation run
 * detail page: header card (period label, status badge), the lifecycle
 * action cluster (`<DepreciationRunStatusActions>`), and the computed lines
 * table (`<DepreciationRunLinesTable>`, always rendered — see that
 * component's own doc comment for why this run never has a "not computed
 * yet" state the way a fresh Payroll run does).
 *
 * `periodId` resolved to a real `seq`/date-range label via Accounting's own
 * `usePeriod()`; once `journalId` is populated (POSTED), it's resolved to a
 * real journal number/link via Accounting's own `useJournal()` — both
 * cross-feature READ-for-display hooks, the same precedent this module's own
 * asset detail page already established for its own foreign-id resolution.
 */
export default function DepreciationRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("fixedAssets.depreciationRuns.detail");
  const runQuery = useDepreciationRun(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/fixed-assets/depreciation-runs">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={runQuery}>{(run) => <RunDetailContent run={run} />}</QueryBoundary>
    </div>
  );
}

function RunDetailContent({ run }: { run: FaDepreciationRunResponseDto }) {
  const t = useTranslations("fixedAssets.depreciationRuns.detail");
  const periodQuery = usePeriod(run.periodId);
  const journalQuery = useJournal(run.journalId ?? undefined);

  const periodLabel = periodQuery.data
    ? t("periodCellLabel", { seq: periodQuery.data.seq, startsOn: periodQuery.data.startsOn, endsOn: periodQuery.data.endsOn })
    : run.periodId;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{periodLabel}</CardTitle>
              <DepreciationRunStatusBadge status={run.status} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailField label={t("periodLabel")} value={periodLabel} />
            <DetailField label={t("statusLabel")} value={<DepreciationRunStatusBadge status={run.status} />} />
            <DetailField
              label={t("journalLabel")}
              value={
                run.journalId ? (
                  <Link href={`/accounting/journals/${run.journalId}`} className="text-primary underline">
                    {journalQuery.data?.number ?? t("viewJournalLink")}
                  </Link>
                ) : (
                  t("notPostedYet")
                )
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("actionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DepreciationRunStatusActions run={run} />
        </CardContent>
      </Card>

      <DepreciationRunLinesTable runId={run.id} />
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
