"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useEmployee } from "@/features/payroll/hooks/use-employees";
import { useLoan } from "@/features/payroll/hooks/use-loans";
import { LoanDecideActions } from "@/features/payroll/components/loan-decide-dialog";
import { LoanScheduleTable } from "@/features/payroll/components/loan-schedule-table";
import { LoanStatusBadge } from "@/features/payroll/components/loan-status-badge";
import { RecordRecoveryDialog } from "@/features/payroll/components/record-recovery-dialog";
import { SettleEarlyDialog } from "@/features/payroll/components/settle-early-dialog";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — a staff loan's detail page:
 * header `Card` (number, employee, status badge, principal/rate/rateKind/
 * termMonths/balance) + the 3 real status-gated actions (`<LoanDecideActions>`
 * only while `PENDING_APPROVAL`, `<RecordRecoveryDialog>`/`<SettleEarlyDialog>`
 * only while `ACTIVE` — each component self-gates its own visibility, this
 * page doesn't duplicate that logic) + `<LoanScheduleTable>` (which itself
 * renders a dedicated "not generated yet" / "written off, never went active"
 * message instead of querying at all for `PENDING_APPROVAL`/`WRITTEN_OFF`).
 *
 * The employee's real name (`useEmployee()`, Part 1's own hook) is resolved
 * and shown alongside the loan's own `employeeId` — the same "resolve the
 * foreign id to a real name, don't just show the uuid" precedent
 * `employee-assignment-panel.tsx`'s own `structureLabelById` map already
 * established for Part 3.
 */
export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.loans.detail");
  const loanQuery = useLoan(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/loans">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={loanQuery}>{(loan) => <LoanDetailCard loan={loan} />}</QueryBoundary>
    </div>
  );
}

function LoanDetailCard({ loan }: { loan: PyrlLoanResponseDto }) {
  const t = useTranslations("payroll.loans.detail");
  const tRateKinds = useTranslations("payroll.loans.rateKinds");
  const employeeQuery = useEmployee(loan.employeeId);
  const employeeLabel = employeeQuery.data ? `${employeeQuery.data.staffNo} — ${employeeQuery.data.fullName}` : loan.employeeId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{loan.number}</CardTitle>
              <LoanStatusBadge status={loan.status} />
            </div>
            <p className="text-sm text-muted-foreground">{t("employeeLine", { employee: employeeLabel })}</p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <DetailField label={t("principalLabel")} value={formatMoney(loan.principal)} />
            <DetailField label={t("rateLabel")} value={loan.rate} />
            <DetailField label={t("rateKindLabel")} value={tRateKinds(loan.rateKind)} />
            <DetailField label={t("termMonthsLabel")} value={t("termMonthsValue", { count: loan.termMonths })} />
            <DetailField label={t("balanceLabel")} value={formatMoney(loan.balance)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("actionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <LoanDecideActions loan={loan} />
          <RecordRecoveryDialog loan={loan} />
          <SettleEarlyDialog loan={loan} />
          {loan.status === "SETTLED" && <p className="text-sm text-muted-foreground">{t("settledNoActionsHint")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("scheduleTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LoanScheduleTable loan={loan} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
