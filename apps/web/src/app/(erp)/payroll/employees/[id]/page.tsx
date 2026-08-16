"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { PyrlEmployeeResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useDepartment } from "@/features/departments/hooks/use-departments";
import { useCostCenter } from "@/features/accounting/hooks/use-cost-centers";
import { useEmployee } from "@/features/payroll/hooks/use-employees";
import { EditEmployeeDialog } from "@/features/payroll/components/edit-employee-dialog";
import { EmployeeExitDialog } from "@/features/payroll/components/employee-exit-dialog";
import { EmployeeBankDetailsPanel } from "@/features/payroll/components/employee-bank-details-panel";
import { EmployeeAssignmentPanel } from "@/features/payroll/components/employee-assignment-panel";
import { EmployeeComponentOverridesPanel } from "@/features/payroll/components/employee-component-overrides-panel";

const ACTIVE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  true: "soft-success",
  false: "soft-secondary",
};

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — a payroll
 * employee's detail page: header `Card` (name, staff no., employment type +
 * status badges, `<EditEmployeeDialog>` + `<EmployeeExitDialog>` — the latter
 * only rendered while `isActive`), a details grid (department/cost center
 * resolved to real names, job title, hire/exit dates, NSSF/SHIF numbers,
 * linked login account), and `<EmployeeBankDetailsPanel>` as its own
 * separate, explicit-reveal section — the same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `app/(erp)/banking/accounts/[id]/page.tsx`
 * (Slice 21 Part 1) already establishes.
 *
 * **Phase 6 Slice 22 Part 3 additions**: `<EmployeeAssignmentPanel>` (this
 * employee's `pyrl_employee_assignment` history — which salary structure
 * they've been assigned to, their own `basicPay` snapshot per period, plus
 * "New assignment"/"End current assignment" actions) and
 * `<EmployeeComponentOverridesPanel>` (their `pyrl_employee_component`
 * history — personal, additional per-employee amounts against Part 1's own
 * component catalogue; see that panel's own doc comment for why this is
 * ADDITIVE, not a true override, at real payroll-compute time). Both are
 * embedded here as sections rather than given their own top-level route —
 * neither backend controller has a global "list across all employees"
 * endpoint (every route requires `employeeId`), so a standalone list screen
 * would have nothing real to back it. This is a deliberate omission, not an
 * oversight — no new Payroll nav child was added this part either.
 *
 * **`nationalId`/`kraPin` are shown as real, unmasked plaintext directly on
 * this card** — NOT redacted, confirmed live: `EmployeesService.redact()`
 * never touches either field (`employees.api.ts`'s own doc comment has the
 * full finding), unlike `payDetails`/`bankName`/`branch`/`account`, which
 * genuinely are `"***"`-masked here and only ever real via the separate
 * `<EmployeeBankDetailsPanel>` reveal action below.
 */
export default function PayrollEmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.employees.detail");
  const employeeQuery = useEmployee(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/employees">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={employeeQuery}>{(employee) => <EmployeeDetailCard employee={employee} />}</QueryBoundary>
    </div>
  );
}

function EmployeeDetailCard({ employee }: { employee: PyrlEmployeeResponseDto }) {
  const t = useTranslations("payroll.employees.detail");
  const tEmploymentTypes = useTranslations("payroll.employmentTypes");
  const departmentQuery = useDepartment(employee.departmentId);
  const costCenterQuery = useCostCenter(employee.costCenterId);
  const departmentLabel = departmentQuery.data?.name ?? employee.departmentId;
  const costCenterLabel = costCenterQuery.data ? `${costCenterQuery.data.code} — ${costCenterQuery.data.name}` : employee.costCenterId;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{employee.fullName}</CardTitle>
              <Badge variant="outline">{employee.staffNo}</Badge>
              <Badge variant="soft-secondary">{tEmploymentTypes(employee.employmentType)}</Badge>
              <Badge variant={ACTIVE_BADGE_VARIANT[String(employee.isActive)] ?? "outline"}>{employee.isActive ? t("active") : t("inactive")}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditEmployeeDialog employee={employee} />
            {employee.isActive && <EmployeeExitDialog employee={employee} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("departmentLabel")}</p>
              <p className="text-sm text-foreground">{departmentLabel}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("costCenterLabel")}</p>
              <p className="text-sm text-foreground">{costCenterLabel}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("hireDateLabel")}</p>
              <p className="text-sm text-foreground">{employee.hireDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("exitDateLabel")}</p>
              <p className="text-sm text-foreground">{employee.exitDate ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("nationalIdLabel")}</p>
              <p className="text-sm text-foreground">{employee.nationalId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("kraPinLabel")}</p>
              <p className="text-sm text-foreground">{employee.kraPin}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("nssfNoLabel")}</p>
              <p className="text-sm text-foreground">{employee.nssfNo ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("shifNoLabel")}</p>
              <p className="text-sm text-foreground">{employee.shifNo ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("userIdLabel")}</p>
              <p className="text-sm text-foreground">{employee.userId ?? t("noLinkedUser")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("bankDetailsSectionTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("bankDetailsSectionHint")}</p>
      </div>
      <EmployeeBankDetailsPanel employeeId={employee.id} />

      <EmployeeAssignmentPanel employeeId={employee.id} />

      <EmployeeComponentOverridesPanel employeeId={employee.id} />
    </div>
  );
}
