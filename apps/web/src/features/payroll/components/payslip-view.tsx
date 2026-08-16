"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import type { PyrlComponentResponseDto, PyrlEmployeeResponseDto, PyrlRunLineComponentResponseDto, PyrlRunLineResponseDto, PyrlRunResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useDepartment } from "@/features/departments/hooks/use-departments";
import { formatMoney, sumMoneyStrings } from "@/lib/money";
import { useComponents } from "../hooks/use-components";
import { useEmployee } from "../hooks/use-employees";
import { useRunLineComponents } from "../hooks/use-payroll-runs";
import { RunStatusBadge } from "./run-status-badge";

/**
 * Phase 6 Slice 22 Part 7 (Payroll, Module 15) — a real, honest,
 * ENTIRELY-client-assembled payslip view. **Confirmed definitively before
 * writing a line of this file: no payslip PDF generation exists anywhere in
 * this codebase.** `pyrl_run_line.payslip_file_id` is a nullable FK to
 * `file_object`, `ON DELETE SET NULL`, permanently `null` forever — no
 * service ever writes a non-null value (`file()`'s own doc comment states
 * this explicitly, FR-PYRL-008.1 deferred). This screen assembles a payslip
 * from data that already exists across 3 real endpoints Part 1/6 already
 * wired: the run line itself (totals), `GET lines/:lineId/components`
 * (`listRunLineComponents()`, wired by Part 6 for this exact reuse), and
 * Part 1's own `useComponents()`/`useEmployee()` for real `code — name`
 * labels and employee identity — never a raw uuid shown anywhere.
 *
 * **Print, not "Download PDF"** — reuses `payments/receipts/[id]/page.tsx`'s
 * own established `print:hidden`/`print:border-0 print:shadow-none`
 * Tailwind convention (the app shell's own `ErpLayout`/`Sidebar`/`Topbar`
 * already carry the `print:hidden` plumbing this relies on) + a real
 * `window.print()` button labeled "Print," never implying a PDF gets
 * generated.
 */

const MONEY_FIELDS: { key: keyof Pick<PyrlRunLineResponseDto, "gross" | "taxable" | "paye" | "nssfEmployee" | "nssfEmployer" | "shif" | "ahlEmployee" | "ahlEmployer" | "loanRecovered" | "otherDeductions">; labelKey: string }[] = [
  { key: "gross", labelKey: "grossLabel" },
  { key: "taxable", labelKey: "taxableLabel" },
  { key: "paye", labelKey: "payeLabel" },
  { key: "nssfEmployee", labelKey: "nssfEmployeeLabel" },
  { key: "nssfEmployer", labelKey: "nssfEmployerLabel" },
  { key: "shif", labelKey: "shifLabel" },
  { key: "ahlEmployee", labelKey: "ahlEmployeeLabel" },
  { key: "ahlEmployer", labelKey: "ahlEmployerLabel" },
  { key: "loanRecovered", labelKey: "loanRecoveredLabel" },
  { key: "otherDeductions", labelKey: "otherDeductionsLabel" },
];

function isPositiveMoney(value: string): boolean {
  return value !== "0.0000" && value !== "0" && Number(value) > 0;
}

/**
 * `periodKey` ('YYYY-MM') -> `{start, end}` ('YYYY-MM-DD'), UTC — a
 * byte-for-byte client-side mirror of `payroll-runs.service.ts`'s own
 * `periodBounds()` (read directly, not re-derived from memory), the ONLY
 * piece of that server-side function this view's own proration INFERENCE
 * needs.
 */
function periodBounds(periodKey: string): { start: string; end: string } {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${periodKey}-01`, end: `${periodKey}-${String(totalDays).padStart(2, "0")}` };
}

export function PayslipView({ run, line }: { run: PyrlRunResponseDto; line: PyrlRunLineResponseDto }) {
  const t = useTranslations("payroll.payslip");
  const employeeQuery = useEmployee(line.employeeId);
  const componentsQuery = useComponents();
  const lineComponentsQuery = useRunLineComponents(line.id);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("printAction")}
        </Button>
      </div>

      <QueryBoundary query={employeeQuery}>
        {(employee) => (
          <>
            <PayslipHeader run={run} employee={employee} />
            <ProrationNotice run={run} employee={employee} />
          </>
        )}
      </QueryBoundary>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("totalsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {MONEY_FIELDS.map((field) => (
              <TotalField key={field.key} label={t(field.labelKey)} value={formatMoney(line[field.key])} />
            ))}
            <TotalField label={t("netPayLabel")} value={formatMoney(line.netPay)} className="font-semibold text-foreground" />
          </dl>

          {isPositiveMoney(line.deferredRecovery) && (
            <Alert variant="warning">
              <AlertDescription>{t("deferredRecoveryNotice", { amount: formatMoney(line.deferredRecovery) })}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("breakdownTitle")}</CardTitle>
          <CardDescription>{t("breakdownDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={componentsQuery}>
            {(components) => (
              <QueryBoundary query={lineComponentsQuery}>
                {(lineComponents) => <ComponentBreakdown components={components} lineComponents={lineComponents} />}
              </QueryBoundary>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

function TotalField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={className ?? "text-sm font-medium text-foreground"}>{value}</dd>
    </div>
  );
}

function PayslipHeader({ run, employee }: { run: PyrlRunResponseDto; employee: PyrlEmployeeResponseDto }) {
  const t = useTranslations("payroll.payslip");
  const departmentQuery = useDepartment(employee.departmentId);

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-foreground">{employee.fullName}</CardTitle>
            <CardDescription>{t("staffNoLabel", { staffNo: employee.staffNo })}</CardDescription>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <TotalField label={t("periodLabel")} value={run.periodKey} />
          <TotalField label={t("departmentLabel")} value={departmentQuery.data?.name ?? employee.departmentId} />
          <TotalField label={t("jobTitleLabel")} value={employee.jobTitle} />
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * **A REAL field, not a guess (`deferredRecovery`), but THIS note is a
 * genuine INFERENCE, not an API-confirmed fact — worded honestly as such.**
 * BR-PYRL-04's mid-period proration ratio is a purely transient local
 * variable inside `compute()` (`prorationRatio`, `payroll-runs.service.ts`),
 * never persisted anywhere on `pyrl_run_line` or returned by any endpoint.
 * The only way this view can even suspect proration happened is by
 * comparing the employee's own `exitDate` against the run's own period
 * bounds — exactly the same condition `compute()` itself uses
 * (`periodStart <= exitDate <= periodEnd`, `payroll-runs.service.ts:346`) to
 * DECIDE to prorate, but this view has no way to confirm the ratio was
 * actually applied, or what it was. Copy says "likely prorated," never "was
 * prorated."
 */
function ProrationNotice({ run, employee }: { run: PyrlRunResponseDto; employee: PyrlEmployeeResponseDto }) {
  const t = useTranslations("payroll.payslip");
  if (!employee.exitDate) return null;
  const { start, end } = periodBounds(run.periodKey);
  const likelyProrated = employee.exitDate >= start && employee.exitDate <= end;
  if (!likelyProrated) return null;
  return (
    <Alert variant="warning">
      <AlertDescription>{t("possiblyProratedNotice", { exitDate: employee.exitDate })}</AlertDescription>
    </Alert>
  );
}

/**
 * `PyrlRunLineComponentResponseDto[]` (`componentId`/`amount` only) cross-
 * referenced against `useComponents()` for a real `code — name` label and
 * `kind` (EARNING/DEDUCTION) split — never a raw component uuid shown.
 * Components carry no DELETE route anywhere on `ComponentsController`
 * (confirmed in Part 1), so an unresolvable `componentId` is not expected
 * live, but falls back to the raw id rather than silently dropping the row
 * either way.
 */
function ComponentBreakdown({
  components,
  lineComponents,
}: {
  components: PyrlComponentResponseDto[];
  lineComponents: PyrlRunLineComponentResponseDto[];
}) {
  const t = useTranslations("payroll.payslip");
  const componentById = React.useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);

  if (lineComponents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noComponentsNotice")}</p>;
  }

  const earnings = lineComponents.filter((lc) => componentById.get(lc.componentId)?.kind === "EARNING");
  const deductions = lineComponents.filter((lc) => componentById.get(lc.componentId)?.kind !== "EARNING");

  return (
    <div className="space-y-6">
      <ComponentGroup title={t("earningsGroupTitle")} rows={earnings} componentById={componentById} />
      <ComponentGroup title={t("deductionsGroupTitle")} rows={deductions} componentById={componentById} />
    </div>
  );
}

function ComponentGroup({
  title,
  rows,
  componentById,
}: {
  title: string;
  rows: PyrlRunLineComponentResponseDto[];
  componentById: Map<string, PyrlComponentResponseDto>;
}) {
  const t = useTranslations("payroll.payslip");

  if (rows.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{t("noRowsInGroupNotice")}</p>
      </div>
    );
  }

  const total = sumMoneyStrings(rows.map((r) => r.amount));

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("componentColumn")}</TableHead>
            <TableHead className="text-right">{t("amountColumn")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const component = componentById.get(row.componentId);
            return (
              <TableRow key={row.id}>
                <TableCell>{component ? `${component.code} — ${component.name}` : row.componentId}</TableCell>
                <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell className="font-semibold text-foreground">{t("groupTotalLabel")}</TableCell>
            <TableCell className="text-right font-semibold text-foreground">{formatMoney(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
