"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Search, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PyrlEmployeeResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useEmployeeSearch, useEmployees } from "@/features/payroll/hooks/use-employees";
import { CreateEmployeeDialog } from "@/features/payroll/components/create-employee-dialog";

const ALL_SENTINEL = "__all__";

const ACTIVE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  true: "soft-success",
  false: "soft-secondary",
};

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — the Payroll
 * Employees list: a debounced search box (`GET .../employees/search`, the
 * intended search mechanism per this part's own task brief, NOT a
 * client-side filter over the plain list) + `isActive`/`departmentId`
 * `<Select>` filters (real server-side query params on the plain list) +
 * `<DataTable>` inside `<QueryBoundary>`, the same "search vs. filtered list,
 * only one query enabled at a time" shape `app/(erp)/procurement/suppliers/page.tsx`
 * (Slice 18 Part 1) already establishes.
 *
 * **`payroll:employee:view` covers this list; create/edit/exit need the
 * narrower `payroll:employee:manage`** — no page-level role-name gating is
 * applied here (checked directly: `hasAnyRole()`/`decodeRoles()` from
 * `lib/permissions.ts` are used ONLY for nav-item visibility anywhere in this
 * codebase, confirmed by grep — zero page-level call sites exist for either).
 * This page follows the SAME established precedent every other `:view`/
 * `:manage`-split module already uses (`accounting/cost-centers/page.tsx`:
 * `accounting:cost-center:view` vs `:manage`) — the create button/edit/exit
 * actions are always rendered, and a role missing `:manage` gets a real
 * `403` surfaced via `ApiError.message` in the relevant dialog's own error
 * state on actual submit, exactly the same "the 403 IS the enforcement"
 * discipline `<QueryBoundary>`'s own doc comment declares as the one
 * mechanism that actually reflects the server's real RBAC decision.
 */
export default function PayrollEmployeesPage() {
  const t = useTranslations("payroll.employees.list");
  const tEmploymentTypes = useTranslations("payroll.employmentTypes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const departmentsQuery = useDepartments();
  const [isActive, setIsActive] = React.useState<"true" | "false" | "">("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300).trim();
  const isSearching = debouncedSearch.length > 0;

  const listQuery = useEmployees(
    { isActive: isActive === "" ? undefined : isActive === "true", departmentId: departmentId || undefined },
    { enabled: !isSearching },
  );
  const searchQuery = useEmployeeSearch(debouncedSearch, { enabled: isSearching });
  const activeQuery = isSearching ? searchQuery : listQuery;

  const departmentNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departmentsQuery.data ?? []) map.set(d.id, d.name);
    return map;
  }, [departmentsQuery.data]);

  const columns = React.useMemo<ColumnDef<PyrlEmployeeResponseDto>[]>(
    () => [
      { accessorKey: "staffNo", header: t("columns.staffNo") },
      { accessorKey: "fullName", header: t("columns.fullName") },
      { accessorKey: "jobTitle", header: t("columns.jobTitle") },
      { id: "department", header: t("columns.department"), cell: ({ row }) => departmentNameById.get(row.original.departmentId) ?? "—" },
      {
        id: "employmentType",
        header: t("columns.employmentType"),
        cell: ({ row }) => <Badge variant="soft-secondary">{tEmploymentTypes(row.original.employmentType)}</Badge>,
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={ACTIVE_BADGE_VARIANT[String(row.original.isActive)] ?? "outline"}>
            {row.original.isActive ? t("active") : t("inactive")}
          </Badge>
        ),
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
              router.push(`/payroll/employees/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tEmploymentTypes, departmentNameById, tCommon, router],
  );

  const hasFilters = isActive !== "" || departmentId !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateEmployeeDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("searchLabel")}</Label>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("searchPlaceholder")} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              </div>
            </div>
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select
                value={isActive || ALL_SENTINEL}
                onValueChange={(v) => setIsActive(v === ALL_SENTINEL ? "" : (v as "true" | "false"))}
                disabled={isSearching}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  <SelectItem value="true">{t("active")}</SelectItem>
                  <SelectItem value="false">{t("inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.departmentLabel")}</Label>
              <Select value={departmentId || ALL_SENTINEL} onValueChange={(v) => setDepartmentId(v === ALL_SENTINEL ? "" : v)} disabled={isSearching}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allDepartments")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allDepartments")}</SelectItem>
                  {(departmentsQuery.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsActive("");
                  setDepartmentId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={activeQuery} isEmpty={(d) => d.length === 0}>
            {(employees) =>
              employees.length === 0 && isSearching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noEmployeesMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={employees} onRowClick={(employee) => router.push(`/payroll/employees/${employee.id}`)} />
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
