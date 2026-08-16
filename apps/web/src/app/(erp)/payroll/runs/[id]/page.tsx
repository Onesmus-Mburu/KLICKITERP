"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { PyrlRunResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { RunLinesTable } from "@/features/payroll/components/run-lines-table";
import { RunOneoffsPanel } from "@/features/payroll/components/run-oneoffs-panel";
import { RunStatusActions } from "@/features/payroll/components/run-status-actions";
import { RunStatusBadge } from "@/features/payroll/components/run-status-badge";
import { RunTotalsCard } from "@/features/payroll/components/run-totals-card";
import { RunVarianceReport } from "@/features/payroll/components/run-variance-report";
import { useRun } from "@/features/payroll/hooks/use-payroll-runs";
import { useUsersLookup } from "@/features/payroll/hooks/use-users-lookup";
import type { PyrlRunStatus } from "@/features/payroll/api/payroll-runs.api";

const REVIEW_OR_LATER: PyrlRunStatus[] = ["REVIEW", "PENDING_APPROVAL", "APPROVED", "COMMITTED", "PAID", "FILED"];

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the payroll run detail page,
 * the main event of this part: status badge + lifecycle action buttons
 * (`<RunStatusActions>`), the totals summary card, the one-offs panel
 * (period-scoped to this run's own `periodKey`), the run-lines summary
 * table (only rendered once this run has been computed at least once — a
 * `DRAFT` run has no lines yet, and `<RunLinesTable>`'s own honesty note
 * about active-employee-count mismatches only makes sense once lines
 * genuinely exist), and — once `status` reaches `REVIEW` or later — the
 * variance report section.
 *
 * **Phase 6 Slice 22 Part 7 completes the lifecycle on this SAME page** —
 * `commit`/`pay`/`file` are new actions folded directly into
 * `<RunStatusActions>` (own file's doc comment) rather than a new nav child
 * or a second detail page, confirming the "extend this same page" framing
 * Part 6 above only asserted as likely. `<RunLinesTable>` also gained a
 * "View payslip" link per row this part, navigating to the new
 * `/payroll/runs/[id]/lines/[lineId]` route (`payslip-view.tsx`).
 */
export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.runs.detail");
  const runQuery = useRun(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/runs">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={runQuery}>{(run) => <RunDetailContent run={run} />}</QueryBoundary>
    </div>
  );
}

/**
 * `initiatedBy`/`approvedBy` are `usr_user` ids (the acting staff member),
 * NOT `pyrl_employee` ids — resolved via `useUsersLookup()` (`GET /users`,
 * the same lookup `create-employee-dialog.tsx`'s own "linked login account"
 * picker already uses), not `useEmployee()`, which resolves a completely
 * different id space.
 */
function RunDetailContent({ run }: { run: PyrlRunResponseDto }) {
  const t = useTranslations("payroll.runs.detail");
  const tKinds = useTranslations("payroll.runs.kinds");
  const usersQuery = useUsersLookup();

  const userLabelById = React.useMemo(
    () => new Map((usersQuery.data?.items ?? []).map((u) => [u.id, u.fullName])),
    [usersQuery.data],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{t("periodLabel", { period: run.periodKey })}</CardTitle>
              <RunStatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">{tKinds(run.runKind)}</p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailField label={t("runKindLabel")} value={tKinds(run.runKind)} />
            <DetailField label={t("statusLabel")} value={<RunStatusBadge status={run.status} />} />
            <DetailField label={t("initiatedByLabel")} value={userLabelById.get(run.initiatedBy) ?? run.initiatedBy} />
            <DetailField
              label={t("approvedByLabel")}
              value={run.approvedBy ? (userLabelById.get(run.approvedBy) ?? run.approvedBy) : t("notApplicable")}
            />
            {run.supplementsRunId && (
              <DetailField
                label={t("supplementsRunLabel")}
                value={
                  <Link href={`/payroll/runs/${run.supplementsRunId}`} className="text-primary underline">
                    {t("viewRunLink")}
                  </Link>
                }
              />
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("actionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RunStatusActions run={run} />
        </CardContent>
      </Card>

      <RunTotalsCard run={run} />

      <RunOneoffsPanel periodKey={run.periodKey} />

      {run.status === "DRAFT" ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">{t("notComputedYetNotice")}</CardContent>
        </Card>
      ) : (
        <RunLinesTable runId={run.id} />
      )}

      {REVIEW_OR_LATER.includes(run.status) && <RunVarianceReport run={run} />}
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
