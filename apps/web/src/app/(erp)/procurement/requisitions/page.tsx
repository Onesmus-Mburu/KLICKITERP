"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { RequisitionResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useRequisitions } from "@/features/procurement/hooks/use-requisitions";
import {
  EMPTY_REQUISITION_FILTERS,
  RequisitionFilters,
  requisitionFiltersToParams,
  type RequisitionFiltersState,
} from "@/features/procurement/components/requisition-filters";
import { CreateRequisitionDialog } from "@/features/procurement/components/create-requisition-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  SUBMITTED: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-success",
  REJECTED: "soft-destructive",
  CONVERTED: "soft-success",
  CANCELLED: "outline",
};

/**
 * Phase 6 Slice 18 Part 2 (Procurement, Module 12) — the Requisitions list:
 * Card + `<RequisitionFilters>` (status + department) + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to detail — the same
 * `onRowClick` mechanism `suppliers/page.tsx` (Part 1) already established.
 * `procurement:requisition:view`-gated server-side; a role missing it hits
 * `<QueryBoundary>`'s own permission-denied state, not a page-level special
 * case.
 *
 * The department column resolves each row's `departmentId` against
 * `useDepartments()`'s own list (already fetched for the filter bar's
 * picker, so this rides that same cache rather than adding a second round
 * trip) — `RequisitionResponseDto` carries only the id, no denormalized
 * department name.
 */
export default function RequisitionsPage() {
  const t = useTranslations("procurement.requisitions.list");
  const tStatuses = useTranslations("procurement.requisitions.statuses");
  const router = useRouter();
  const [filters, setFilters] = React.useState<RequisitionFiltersState>(EMPTY_REQUISITION_FILTERS);
  const requisitionsQuery = useRequisitions(requisitionFiltersToParams(filters));
  const departmentsQuery = useDepartments();

  const departmentNameById = React.useMemo(
    () => new Map((departmentsQuery.data ?? []).map((department) => [department.id, department.name])),
    [departmentsQuery.data],
  );

  const columns = React.useMemo<ColumnDef<RequisitionResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      {
        id: "department",
        header: t("columns.department"),
        cell: ({ row }) => departmentNameById.get(row.original.departmentId) ?? row.original.departmentId,
      },
      { id: "totalEstimate", header: t("columns.totalEstimate"), cell: ({ row }) => formatMoney(row.original.totalEstimate) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>
        ),
      },
    ],
    [t, tStatuses, departmentNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateRequisitionDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RequisitionFilters value={filters} onChange={setFilters} />

          <QueryBoundary query={requisitionsQuery} isEmpty={(d) => d.length === 0}>
            {(requisitions) => (
              <DataTable columns={columns} data={requisitions} onRowClick={(r) => router.push(`/procurement/requisitions/${r.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
