"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useStudents } from "@/features/students/hooks/use-students";

/**
 * Slice 2 (Phase 6 Slice 8) — the bulk "Generate Invoice" screen's student
 * picker: a 4-column checkbox grid + a "Select all" toggle, backed by the
 * EXISTING `useStudents()` hook (Students module, Phase 6 Slice 2c),
 * filtered to the chosen class + `status:"ACTIVE"`, `pageSize:200` (the
 * existing `PaginationQueryDto` max — a grade with more than 200 active
 * students would truncate here, a documented, accepted v1 limitation per
 * the plan's own flagged open risk #3).
 *
 * Phase 6 Slice 9 (Part B) — gained a CLIENT-SIDE search filter (a plain
 * `.filter()` over the already-fetched ≤200-row list already sitting in
 * `data.items` — no new backend call, no debounce, per the plan's explicit
 * "instant, in-memory" instruction, unlike the server-paginated
 * Pending/Upcoming/Receipts screens' debounced `q` param). `selected` is
 * never cleared/rewritten by the filter itself — only `toggle`/`toggleAll`
 * mutate it, and both were checked/fixed (see `toggleAll()`'s own doc
 * comment below) to only ever touch the currently-VISIBLE (filtered) ids,
 * so a student selected before typing a filter stays selected even once
 * filtered out of view — the same selection-survives-filtering principle
 * `FeeCategoryChipPicker` (Part C) independently establishes for its own
 * filter.
 */
export function StudentSelectionGrid({
  classId,
  selected,
  onChange,
}: {
  classId: string | null;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("billing.bulkGenerate");
  const studentsQuery = useStudents({ classId: classId ?? undefined, status: "ACTIVE", pageSize: 200 }, { enabled: !!classId });
  const [searchDraft, setSearchDraft] = React.useState("");

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  function toggleOne(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  /**
   * `ids` is now only the currently-VISIBLE (filtered) subset, not
   * necessarily every fetched student — this must only ADD/REMOVE those
   * specific ids from the existing `selected` array, never replace the
   * whole selection with just `ids` (the pre-Part-B version's `onChange(ids)`
   * was safe only because `ids` was always the FULL fetched list; once a
   * filter can narrow `ids` to a subset, that old shape would silently
   * deselect any already-selected student who's merely filtered out of view
   * right now — caught and fixed here, not left as a latent bug).
   */
  function toggleAll(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
    if (allSelected) {
      onChange(selected.filter((id) => !ids.includes(id)));
    } else {
      const merged = new Set(selected);
      for (const id of ids) merged.add(id);
      onChange([...merged]);
    }
  }

  if (!classId) {
    return <p className="text-sm text-muted-foreground">{t("selectClassFirst")}</p>;
  }

  return (
    <QueryBoundary query={studentsQuery} isEmpty={(d) => d.items.length === 0}>
      {(data) => {
        const students = data.items;
        const query = searchDraft.trim().toLowerCase();
        const filteredStudents =
          query.length === 0
            ? students
            : students.filter((student) => {
                const name = `${student.firstName} ${student.lastName}`.toLowerCase();
                return name.includes(query) || student.admissionNo.toLowerCase().includes(query);
              });
        const ids = filteredStudents.map((s) => s.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
        return (
          <div className="space-y-3">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("studentSearchPlaceholder")}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={allSelected} onChange={() => toggleAll(ids)} />
                {t("selectAll")}
              </label>
              <span className="text-xs text-muted-foreground">{t("selectedCount", { count: selected.length })}</span>
            </div>
            {filteredStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noStudentsMatchSearch")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={selectedSet.has(student.id)} onChange={() => toggleOne(student.id)} />
                    <span className="truncate">
                      {student.firstName} {student.lastName}
                      <span className="ml-1 text-xs text-muted-foreground">({student.admissionNo})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
