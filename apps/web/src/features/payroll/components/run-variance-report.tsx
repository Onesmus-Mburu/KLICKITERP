"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PyrlRunResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { useEmployees } from "../hooks/use-employees";
import { asVarianceReport } from "../lib/run-totals";

const VARIANCE_REASON_KEYS = ["gross_variance", "net_pay_variance"] as const;

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — `review()`'s own variance
 * report, rendered from `PyrlRunResponseDto.varianceReport` via
 * `lib/run-totals.ts`'s `asVarianceReport()` safe-cast helper (see that
 * file's own doc comment for the exact shape, mirrored word-for-word from
 * `payroll-runs.service.ts:97-104`). Only meaningful once `run.status` has
 * reached `REVIEW` or later — the caller (`RunDetailPage`) gates this
 * component's own visibility on that, matching every other status-gated
 * section in this feature.
 *
 * **The "no prior run available for comparison" case is a real, expected
 * outcome, not a broken/empty state** — when no prior COMMITTED MAIN run
 * exists for comparison (the common case for this part's own live
 * verification, since no run has ever reached `COMMITTED` yet — that's Part
 * 7's job), `priorRunId`/`priorPeriodKey` are genuinely `null` and EVERY
 * current employee lands in `newEmployeeIds` instead of being compared (a
 * new hire isn't a variance, per `review()`'s own doc comment) — this
 * component renders a dedicated message for that case rather than an empty
 * flagged table that would look like nothing happened.
 */
export function RunVarianceReport({ run }: { run: PyrlRunResponseDto }) {
  const t = useTranslations("payroll.runs.varianceReport");
  const tReasons = useTranslations("payroll.runs.varianceReport.reasons");
  const report = asVarianceReport(run.varianceReport);
  const employeesQuery = useEmployees();

  const employeeLabelById = React.useMemo(
    () => new Map((employeesQuery.data ?? []).map((e) => [e.id, `${e.staffNo} — ${e.fullName}`])),
    [employeesQuery.data],
  );

  function labelFor(employeeId: string) {
    return employeeLabelById.get(employeeId) ?? employeeId;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report ? (
          <p className="text-sm text-muted-foreground">{t("notYetAvailableNotice")}</p>
        ) : (
          <>
            {report.priorRunId ? (
              <p className="text-sm text-muted-foreground">
                {t("comparedAgainstLabel", { period: report.priorPeriodKey ?? "" })}{" "}
                <Link href={`/payroll/runs/${report.priorRunId}`} className="text-primary underline">
                  {t("viewPriorRunLink")}
                </Link>
              </p>
            ) : (
              <Alert>
                <AlertDescription>{t("noPriorRunNotice")}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t("flaggedTitle")}</h3>
              {report.flagged.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noFlaggedNotice")}</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("flaggedColumns.employee")}</TableHead>
                        <TableHead>{t("flaggedColumns.priorGross")}</TableHead>
                        <TableHead>{t("flaggedColumns.currentGross")}</TableHead>
                        <TableHead>{t("flaggedColumns.priorNetPay")}</TableHead>
                        <TableHead>{t("flaggedColumns.currentNetPay")}</TableHead>
                        <TableHead>{t("flaggedColumns.reasons")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.flagged.map((entry) => (
                        <TableRow key={entry.employeeId}>
                          <TableCell>{labelFor(entry.employeeId)}</TableCell>
                          <TableCell>{formatMoney(entry.priorGross)}</TableCell>
                          <TableCell>{formatMoney(entry.currentGross)}</TableCell>
                          <TableCell>{formatMoney(entry.priorNetPay)}</TableCell>
                          <TableCell>{formatMoney(entry.currentNetPay)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {entry.reasons.map((reason) => (
                                <Badge key={reason} variant="soft-warning">
                                  {VARIANCE_REASON_KEYS.includes(reason as (typeof VARIANCE_REASON_KEYS)[number])
                                    ? tReasons(reason)
                                    : reason}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{t("newEmployeesTitle")}</h3>
                {report.newEmployeeIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noNewNotice")}</p>
                ) : (
                  <ul className="space-y-1 text-sm text-foreground">
                    {report.newEmployeeIds.map((id) => (
                      <li key={id}>{labelFor(id)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{t("removedEmployeesTitle")}</h3>
                {report.removedEmployeeIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noRemovedNotice")}</p>
                ) : (
                  <ul className="space-y-1 text-sm text-foreground">
                    {report.removedEmployeeIds.map((id) => (
                      <li key={id}>{labelFor(id)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
