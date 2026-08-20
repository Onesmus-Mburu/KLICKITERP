"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, UserSearch } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { CreateLoanDialog } from "@/features/payroll/components/create-loan-dialog";
import { EmployeeCombobox } from "@/features/payroll/components/employee-combobox";
import { LoanStatusBadge } from "@/features/payroll/components/loan-status-badge";
import { useLoans } from "@/features/payroll/hooks/use-loans";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the Loans list: an
 * `<EmployeeCombobox>` picker drives scope (`GET /payroll/loans?employeeId=`
 * genuinely requires `employeeId` — no global cross-employee list exists,
 * confirmed by reading `LoansController.listByEmployee()` directly), then
 * that employee's real loan history + a "New Loan" trigger, per this part's
 * own task brief's suggested shape — "picker selects scope, list follows,"
 * mirroring Part 4's own kind-tabs page shape (`statutory-tables/page.tsx`),
 * just with an employee picker instead of kind tabs.
 *
 * **No list query fires until an employee is actually picked** — rendering
 * `<QueryBoundary>` against a `useLoans(undefined)` call (permanently
 * `enabled: false`) would misreport as an endless "loading" state (see
 * `query-boundary.tsx`'s own doc comment on why `isPending` covers BOTH
 * "actively fetching" and "not enabled yet"), so this page renders its own
 * dedicated "pick an employee" prompt instead until `employeeId` is set.
 *
 * `payroll:loan:create`-gated server-side — the SAME permission reused for
 * every read route on this controller (no dedicated `:view` code exists,
 * confirmed by reading the controller's own doc comment).
 */
export default function LoansPage() {
  const t = useTranslations("payroll.loans.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState("");

  const loansQuery = useLoans(employeeId || undefined);

  const columns = React.useMemo<ColumnDef<PyrlLoanResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      { id: "principal", header: t("columns.principal"), cell: ({ row }) => formatMoney(row.original.principal) },
      { id: "rateKind", header: t("columns.rateKind"), cell: ({ row }) => <RateKindLabel rateKind={row.original.rateKind} /> },
      { id: "balance", header: t("columns.balance"), cell: ({ row }) => formatMoney(row.original.balance) },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <LoanStatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/payroll/loans/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateLoanDialog defaultEmployeeId={employeeId || undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("employeePickerTitle")}</CardTitle>
          <CardDescription>{t("employeePickerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md space-y-1.5">
          <Label>{t("employeeLabel")}</Label>
          <EmployeeCombobox
            value={employeeId}
            onChange={setEmployeeId}
            placeholder={t("employeePlaceholder")}
            searchPlaceholder={t("employeeSearchPlaceholder")}
            emptyText={t("employeeEmptyText")}
            loadingText={t("loadingEmployees")}
          />
        </CardContent>
      </Card>

      {employeeId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
            <CardDescription>{t("listDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={loansQuery} isEmpty={(d) => d.length === 0}>
              {(loans) => <DataTable columns={columns} data={loans} onRowClick={(loan) => router.push(`/payroll/loans/${loan.id}`)} />}
            </QueryBoundary>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
            <UserSearch className="size-5 text-primary" />
          </span>
          <p className="text-sm font-medium text-foreground">{t("noEmployeePickedTitle")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("noEmployeePickedDescription")}</p>
        </div>
      )}
    </div>
  );
}

function RateKindLabel({ rateKind }: { rateKind: PyrlLoanResponseDto["rateKind"] }) {
  const t = useTranslations("payroll.loans.rateKinds");
  return <span>{t(rateKind)}</span>;
}
