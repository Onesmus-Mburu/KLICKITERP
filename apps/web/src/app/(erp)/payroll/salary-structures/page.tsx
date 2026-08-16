"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { PyrlSalaryStructureResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useSalaryStructures } from "@/features/payroll/hooks/use-salary-structures";
import { CreateSalaryStructureDialog } from "@/features/payroll/components/create-salary-structure-dialog";

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — the Salary Structures list:
 * a plain `<DataTable>` inside `<QueryBoundary>`, NO filter UI at all —
 * `GET /payroll/salary-structures` takes no query params whatsoever
 * (confirmed by reading `SalaryStructuresController.list()` directly, a
 * bare `list()` with zero `@Query()` parameters), unlike Part 1's own
 * Components list (`kind`/`isStatutory` filters). Row click navigates to
 * `/payroll/salary-structures/[id]`, the same shape
 * `app/(erp)/payroll/components/page.tsx` establishes. `payroll:structure:manage`-gated
 * server-side — the SAME shared permission gates this list too (no separate
 * view code exists on `SalaryStructuresController` at all, confirmed by
 * reading it directly).
 */
export default function SalaryStructuresPage() {
  const t = useTranslations("payroll.salaryStructures.list");
  const router = useRouter();
  const structuresQuery = useSalaryStructures();

  const columns = React.useMemo<ColumnDef<PyrlSalaryStructureResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "grade", header: t("columns.grade"), cell: ({ row }) => row.original.grade ?? "—" },
      { accessorKey: "effectiveFrom", header: t("columns.effectiveFrom") },
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
        <CreateSalaryStructureDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={structuresQuery} isEmpty={(d) => d.length === 0}>
            {(structures) => (
              <DataTable columns={columns} data={structures} onRowClick={(structure) => router.push(`/payroll/salary-structures/${structure.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
