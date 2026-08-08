"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { DepartmentResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { CreateDepartmentDialog } from "@/features/departments/components/create-department-dialog";
import { EditDepartmentDialog } from "@/features/departments/components/edit-department-dialog";

/**
 * Phase 6 Slice 13 Part 3 — `users:department:view`/`:create`/`:update`.
 * Direct structural mirror of `settings/custom-fields/page.tsx` and
 * `app/(erp)/roles/page.tsx` (Card + a `<DataTable>` inside
 * `<QueryBoundary isEmpty>`, a create-dialog trigger in the header, a
 * per-row edit dialog). No detail page and no row click, unlike Roles —
 * a Department has no sub-resources beyond its own two fields
 * (`name`/`headUserId`), so there's nothing for a detail page to show.
 *
 * **Search field (added post-Slice-13)** — plain CLIENT-SIDE substring
 * filter (name + head-of-department name), no debounce, no backend
 * change: `GET /departments` already returns every department unpaginated
 * — the same "search over an already-fully-loaded small dataset" shape
 * `app/(erp)/roles/page.tsx`'s own search field just added, not a
 * debounced server search (there is no pagination here to search across).
 */
export default function DepartmentsPage() {
  const t = useTranslations("departments.list");
  const departmentsQuery = useDepartments();
  const [search, setSearch] = React.useState("");

  const filterDepartments = React.useCallback(
    (departments: DepartmentResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return departments;
      return departments.filter(
        (d) => d.name.toLowerCase().includes(term) || (d.headUserFullName ?? "").toLowerCase().includes(term),
      );
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<DepartmentResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "headUserFullName", header: t("columns.headUserFullName"), cell: ({ row }) => row.original.headUserFullName ?? "—" },
      { id: "actions", header: t("columns.actions"), cell: ({ row }) => <EditDepartmentDialog department={row.original} /> },
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
        <CreateDepartmentDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <QueryBoundary query={departmentsQuery} isEmpty={(d) => d.length === 0}>
            {(departments) => {
              const filtered = filterDepartments(departments);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noDepartmentsMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
