"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FaDepreciationRunResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { usePeriod } from "@/features/accounting/hooks/use-periods";
import { CreateDepreciationRunDialog } from "@/features/fixed-assets/components/create-depreciation-run-dialog";
import { DepreciationRunStatusBadge } from "@/features/fixed-assets/components/depreciation-run-status-actions";
import { useDepreciationRuns } from "@/features/fixed-assets/hooks/use-depreciation-runs";

const ALL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "POSTED"] as const;
type FaDepreciationRunStatus = (typeof ALL_STATUSES)[number];

/** A run only ever carries `periodId` — resolves it to a real `seq`/date-range label via Accounting's own `usePeriod()` (Slice 17), falling back to the raw id while loading or on a resolution failure (403/404), the same cross-feature read-for-display precedent this module's own asset detail page already established. */
function PeriodLabel({ periodId }: { periodId: string }) {
  const t = useTranslations("fixedAssets.depreciationRuns.list");
  const periodQuery = usePeriod(periodId);
  if (!periodQuery.data) return <span>{periodId}</span>;
  const p = periodQuery.data;
  return <span>{t("periodCellLabel", { seq: p.seq, startsOn: p.startsOn, endsOn: p.endsOn })}</span>;
}

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — the Depreciation Runs
 * list: `GET /fixed-assets/depreciation-runs?status=` (genuinely optional,
 * confirmed by reading `DepreciationRunsController.list()` directly) — a
 * status `<Select>` filter + `<CreateDepreciationRunDialog>` trigger,
 * mirroring `payroll/runs/page.tsx`'s own list-page shape (the closest
 * precedent for a run-lifecycle list in this codebase).
 * `fixed-assets:depreciation:run`-gated server-side.
 */
export default function DepreciationRunsPage() {
  const t = useTranslations("fixedAssets.depreciationRuns.list");
  const router = useRouter();
  const [status, setStatus] = React.useState<FaDepreciationRunStatus | "">("");

  const runsQuery = useDepreciationRuns({ status: status || undefined });

  const columns = React.useMemo<ColumnDef<FaDepreciationRunResponseDto>[]>(
    () => [
      { id: "period", header: t("columns.period"), cell: ({ row }) => <PeriodLabel periodId={row.original.periodId} /> },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <DepreciationRunStatusBadge status={row.original.status} /> },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateDepreciationRunDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("filters.statusLabel")}</Label>
            <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : (v as FaDepreciationRunStatus))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filters.allStatuses")}</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <DepreciationRunStatusBadge status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QueryBoundary query={runsQuery} isEmpty={(d) => d.length === 0}>
            {(runs) => (
              <DataTable columns={columns} data={runs} onRowClick={(run) => router.push(`/fixed-assets/depreciation-runs/${run.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
