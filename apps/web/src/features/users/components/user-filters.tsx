"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { USER_STATUSES } from "../constants";

const ALL_DEPARTMENTS_VALUE = "__all__";
const ALL_STATUSES_VALUE = "__all__";

export interface UserFiltersValue {
  departmentId: string | null;
  status: string | null;
}

export const EMPTY_USER_FILTERS: UserFiltersValue = { departmentId: null, status: null };

/**
 * Department + status `<Select>` row, direct mirror of
 * `features/students/components/student-filters.tsx`'s own department/status
 * shape — department options come from `useDepartments()` (`features/
 * departments`, the correct cross-feature dependency direction per the plan:
 * Users ships last, consumes the reference-data feature that shipped first).
 */
export function UserFilters({ value, onChange }: { value: UserFiltersValue; onChange: (value: UserFiltersValue) => void }) {
  const t = useTranslations("users.list");
  const tStatus = useTranslations("users.status");
  const departmentsQuery = useDepartments();
  const departments = departmentsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select
        value={value.departmentId ?? ALL_DEPARTMENTS_VALUE}
        onValueChange={(v) => onChange({ ...value, departmentId: v === ALL_DEPARTMENTS_VALUE ? null : v })}
      >
        <SelectTrigger className="sm:w-56">
          <SelectValue placeholder={t("allDepartments")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_DEPARTMENTS_VALUE}>{t("allDepartments")}</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.status ?? ALL_STATUSES_VALUE} onValueChange={(v) => onChange({ ...value, status: v === ALL_STATUSES_VALUE ? null : v })}>
        <SelectTrigger className="sm:w-44">
          <SelectValue placeholder={t("allStatuses")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES_VALUE}>{t("allStatuses")}</SelectItem>
          {USER_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
