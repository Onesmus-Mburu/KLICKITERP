"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STUDENT_STATUSES } from "../constants";
import { ClassStreamSelect } from "./class-stream-select";

const ALL_STATUS_VALUE = "__all__";
const SEARCH_DEBOUNCE_MS = 300;

export interface StudentFiltersValue {
  classId: string | null;
  streamId: string | null;
  status: string | null;
  search: string;
}

export const EMPTY_STUDENT_FILTERS: StudentFiltersValue = { classId: null, streamId: null, status: null, search: "" };

/** Class/stream/status `<Select>` row + a 300ms-debounced search input, per the plan. The search box is uncontrolled-feeling (local state updates immediately for a responsive input) but only propagates to `onChange` — and therefore only triggers `useStudentSearch`'s query — after the debounce settles. */
export function StudentFilters({ value, onChange }: { value: StudentFiltersValue; onChange: (value: StudentFiltersValue) => void }) {
  const t = useTranslations("students.list");
  const tStatus = useTranslations("students.status");
  const [searchDraft, setSearchDraft] = React.useState(value.search);
  // Latest `value`/`onChange` via refs (updated every render, no effect
  // dependency needed) so the debounce timer below only ever re-arms on a
  // real `searchDraft` keystroke — not on every parent re-render caused by
  // `onChange` being a fresh closure each time. Avoids a
  // `react-hooks/exhaustive-deps` suppression entirely rather than silencing it.
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  React.useEffect(() => setSearchDraft(value.search), [value.search]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (searchDraft !== valueRef.current.search) {
        onChangeRef.current({ ...valueRef.current, search: searchDraft });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={t("searchPlaceholder")} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
      </div>

      <ClassStreamSelect
        classId={value.classId}
        streamId={value.streamId}
        onClassChange={(classId) => onChange({ ...value, classId, streamId: null })}
        onStreamChange={(streamId) => onChange({ ...value, streamId })}
        classAllLabel={t("allClasses")}
        streamEmptyLabel={t("allStreams")}
        className="flex flex-col gap-3 sm:flex-row"
      />

      <Select value={value.status ?? ALL_STATUS_VALUE} onValueChange={(v) => onChange({ ...value, status: v === ALL_STATUS_VALUE ? null : v })}>
        <SelectTrigger className="sm:w-44">
          <SelectValue placeholder={t("allStatuses")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUS_VALUE}>{t("allStatuses")}</SelectItem>
          {STUDENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
