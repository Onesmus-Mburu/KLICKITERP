"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { PyrlRunResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { CreatePayrollRunDialog } from "@/features/payroll/components/create-payroll-run-dialog";
import { RunStatusBadge } from "@/features/payroll/components/run-status-badge";
import { useRuns } from "@/features/payroll/hooks/use-payroll-runs";
import { asRunTotals } from "@/features/payroll/lib/run-totals";
import type { PyrlRunStatus } from "@/features/payroll/api/payroll-runs.api";

const ALL_STATUSES: PyrlRunStatus[] = ["DRAFT", "COMPUTED", "REVIEW", "PENDING_APPROVAL", "APPROVED", "COMMITTED", "PAID", "FILED"];

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the Payroll Runs list:
 * `GET /payroll/runs?periodKey=&status=` (both genuinely optional,
 * confirmed by reading `PayrollRunsController.list()` directly) — a real
 * `<input type="month">` period filter + a status `<Select>`, both
 * optional, per this part's own task brief ("list (periodKey/status
 * filters), create-run dialog trigger"). `payroll:run:view`-gated
 * server-side — a real, DEDICATED read permission (unlike Loans' own
 * reused-create-permission shape from Part 5), confirmed by reading the
 * controller directly.
 */
export default function PayrollRunsPage() {
  const t = useTranslations("payroll.runs.list");
  const tStatuses = useTranslations("payroll.runs.statuses");
  const tKinds = useTranslations("payroll.runs.kinds");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [periodKey, setPeriodKey] = React.useState("");
  const [status, setStatus] = React.useState<PyrlRunStatus | "">("");

  const runsQuery = useRuns({ periodKey: periodKey || undefined, status: status || undefined });

  const columns = React.useMemo<ColumnDef<PyrlRunResponseDto>[]>(
    () => [
      { accessorKey: "periodKey", header: t("columns.periodKey") },
      { id: "runKind", header: t("columns.runKind"), cell: ({ row }) => tKinds(row.original.runKind) },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <RunStatusBadge status={row.original.status} /> },
      {
        id: "employeeCount",
        header: t("columns.employeeCount"),
        cell: ({ row }) => asRunTotals(row.original.totals)?.employeeCount ?? t("notComputedYet"),
      },
      {
        id: "totalNetPay",
        header: t("columns.totalNetPay"),
        cell: ({ row }) => {
          const totals = asRunTotals(row.original.totals);
          return totals ? formatMoney(totals.totalNetPay) : t("notComputedYet");
        },
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/payroll/runs/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tKinds, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreatePayrollRunDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
            <div className="space-y-1.5">
              <Label>{t("filters.periodKeyLabel")}</Label>
              <Input type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : (v as PyrlRunStatus))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("filters.allStatuses")}</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={runsQuery} isEmpty={(d) => d.length === 0}>
            {(runs) => <DataTable columns={columns} data={runs} onRowClick={(run) => router.push(`/payroll/runs/${run.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
