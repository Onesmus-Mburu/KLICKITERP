"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import type { ListRequisitionsFilters, RequisitionStatus } from "../api/requisitions.api";

const ALL_SENTINEL = "__all__"; // `<Select>` (unlike `<Combobox>`) can't represent "nothing selected" as `value=""` — same pattern `journal-filters.tsx` established.

const STATUS_VALUES: RequisitionStatus[] = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CONVERTED", "CANCELLED"];

export interface RequisitionFiltersState {
  status: RequisitionStatus | "";
  departmentId: string;
}

export const EMPTY_REQUISITION_FILTERS: RequisitionFiltersState = { status: "", departmentId: "" };

export function requisitionFiltersToParams(filters: RequisitionFiltersState): ListRequisitionsFilters {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };
}

/**
 * Phase 6 Slice 18 Part 2 (Requisitions, Procurement) — the requisitions
 * list page's filter bar: status (`GET .../requisitions?status=`) and
 * department (`?departmentId=`) — mirrors `journal-filters.tsx`'s own
 * controlled `value`/`onChange` shape (state lives on the page, not here; no
 * URL/query-string sync, matching this codebase's established filter-bar
 * precedent). The department `<Select>` reuses
 * `features/departments/hooks/use-departments.ts`'s existing
 * `useDepartments()`, per the plan's own explicit instruction not to build a
 * new department picker.
 */
export function RequisitionFilters({ value, onChange }: { value: RequisitionFiltersState; onChange: (next: RequisitionFiltersState) => void }) {
  const t = useTranslations("procurement.requisitions.filters");
  const tStatuses = useTranslations("procurement.requisitions.statuses");
  const departmentsQuery = useDepartments();

  function handleStatusChange(next: string) {
    onChange({ ...value, status: next === ALL_SENTINEL ? "" : (next as RequisitionStatus) });
  }

  function handleDepartmentChange(next: string) {
    onChange({ ...value, departmentId: next === ALL_SENTINEL ? "" : next });
  }

  const hasActiveFilters = !!(value.status || value.departmentId);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-48 space-y-1.5">
        <Label>{t("statusLabel")}</Label>
        <Select value={value.status || ALL_SENTINEL} onValueChange={handleStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allStatuses")}</SelectItem>
            {STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatuses(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-56 space-y-1.5">
        <Label>{t("departmentLabel")}</Label>
        <Select value={value.departmentId || ALL_SENTINEL} onValueChange={handleDepartmentChange} disabled={departmentsQuery.isLoading}>
          <SelectTrigger>
            <SelectValue placeholder={t("allDepartments")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allDepartments")}</SelectItem>
            {(departmentsQuery.data ?? []).map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_REQUISITION_FILTERS)}>
          <X className="size-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
