"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Receipt } from "lucide-react";
import type { PyrlRunLineResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useEmployees } from "../hooks/use-employees";
import { useRunLines } from "../hooks/use-payroll-runs";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the run's own per-employee
 * summary table (`GET /payroll/runs/:id/lines`, `PyrlRunLineResponseDto[]`).
 * A SUMMARY table for reviewing the run, not the full drill-into-components
 * breakdown — that's `GET lines/:lineId/components`, wired in
 * `payroll-runs.api.ts`/`use-payroll-runs.ts` for Part 7's own payslip view
 * to reuse.
 *
 * **Phase 6 Slice 22 Part 7** — each row now carries a real "View payslip"
 * link to `/payroll/runs/{runId}/lines/{lineId}`, a dedicated, bookmarkable,
 * print-friendly route (`payslip-view.tsx`). Rendered for every line
 * regardless of the run's own current status — a payslip is a real,
 * assemblable view of already-computed data (gross/taxable/statutory/
 * component breakdown) from the very first `compute()` onward, not
 * something that only becomes meaningful once the run reaches `PAID`/`FILED`.
 *
 * **The active-employee-count mismatch honesty note** — `compute()` silently
 * skips an active employee ENTIRELY when they have no salary-structure
 * assignment covering the period (`if (!assignment) continue`,
 * `payroll-runs.service.ts:352`) — no error, no warning field anywhere in
 * the response. This table compares the real active-employee count
 * (`GET /payroll/employees?isActive=true`) against the real line count and
 * surfaces a plain, honest note when they differ — it deliberately does NOT
 * try to name which employees were skipped (the API gives no way to know
 * that without cross-referencing every active employee's own assignment
 * history), matching the task brief's own instruction that a simple
 * count-mismatch note is the honest, achievable signal here.
 *
 * **`deferredRecovery > 0` gets a real, visible badge** — it directly means
 * BR-PYRL-03's protected-net floor was hit for that employee this period
 * (their full loan installment couldn't be recovered without dropping their
 * net pay below `basicPay × protected_net_floor_ratio`); no other UI surface
 * exists for this field anywhere yet.
 */
export function RunLinesTable({ runId }: { runId: string }) {
  const t = useTranslations("payroll.runs.linesTable");
  const linesQuery = useRunLines(runId);
  const employeesQuery = useEmployees();
  const activeEmployeesQuery = useEmployees({ isActive: true });

  const employeeLabelById = React.useMemo(
    () => new Map((employeesQuery.data ?? []).map((e) => [e.id, `${e.staffNo} — ${e.fullName}`])),
    [employeesQuery.data],
  );

  const columns = React.useMemo<ColumnDef<PyrlRunLineResponseDto>[]>(
    () => [
      { id: "employee", header: t("columns.employee"), cell: ({ row }) => employeeLabelById.get(row.original.employeeId) ?? row.original.employeeId },
      { id: "gross", header: t("columns.gross"), cell: ({ row }) => formatMoney(row.original.gross) },
      { id: "taxable", header: t("columns.taxable"), cell: ({ row }) => formatMoney(row.original.taxable) },
      { id: "paye", header: t("columns.paye"), cell: ({ row }) => formatMoney(row.original.paye) },
      { id: "nssfEmployee", header: t("columns.nssfEmployee"), cell: ({ row }) => formatMoney(row.original.nssfEmployee) },
      { id: "nssfEmployer", header: t("columns.nssfEmployer"), cell: ({ row }) => formatMoney(row.original.nssfEmployer) },
      { id: "shif", header: t("columns.shif"), cell: ({ row }) => formatMoney(row.original.shif) },
      { id: "ahlEmployee", header: t("columns.ahlEmployee"), cell: ({ row }) => formatMoney(row.original.ahlEmployee) },
      { id: "ahlEmployer", header: t("columns.ahlEmployer"), cell: ({ row }) => formatMoney(row.original.ahlEmployer) },
      { id: "loanRecovered", header: t("columns.loanRecovered"), cell: ({ row }) => formatMoney(row.original.loanRecovered) },
      { id: "otherDeductions", header: t("columns.otherDeductions"), cell: ({ row }) => formatMoney(row.original.otherDeductions) },
      { id: "netPay", header: t("columns.netPay"), cell: ({ row }) => <span className="font-semibold text-foreground">{formatMoney(row.original.netPay)}</span> },
      {
        id: "deferredRecovery",
        header: t("columns.deferredRecovery"),
        cell: ({ row }) => {
          const value = row.original.deferredRecovery;
          const isPositive = value !== "0.0000" && value !== "0" && Number(value) > 0;
          return isPositive ? (
            <Badge variant="soft-warning">{t("deferredRecoveryBadge", { amount: formatMoney(value) })}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "payslip",
        header: t("columns.payslip"),
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link href={`/payroll/runs/${runId}/lines/${row.original.id}`}>
              <Receipt className="size-4" />
              {t("viewPayslip")}
            </Link>
          </Button>
        ),
      },
    ],
    [t, employeeLabelById, runId],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
          {(lines) => (
            <>
              {activeEmployeesQuery.data && activeEmployeesQuery.data.length !== lines.length && (
                <Alert variant="warning">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    {t("employeeCountMismatchNotice", { active: activeEmployeesQuery.data.length, included: lines.length })}
                  </AlertDescription>
                </Alert>
              )}
              <DataTable columns={columns} data={lines} />
            </>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
