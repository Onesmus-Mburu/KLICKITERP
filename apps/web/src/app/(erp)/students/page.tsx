"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { QueryObserverResult } from "@tanstack/react-query";
import { Layers, Plus, Upload } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { EMPTY_STUDENT_FILTERS, StudentFilters, type StudentFiltersValue } from "@/features/students/components/student-filters";
import { useStudentColumns } from "@/features/students/components/student-columns";
import { BulkImportDialog } from "@/features/students/components/bulk-import-dialog";
import { useStudents, useStudentSearch } from "@/features/students/hooks/use-students";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Student directory — list/search/filter (Phase 6 Slice 2). Phase 6 Slice
 * 2c: `StudentsController.list()` (the plain, unfiltered-by-search path) now
 * has real server-side pagination — wired here via `serverPagination`,
 * replacing the client-side-fallback mode this page ran in before.
 * `StudentsController_search` (the name/admission-no lookup path) is
 * UNCHANGED — still a bare, unbounded array (no pagination on that endpoint,
 * out of this pass's scope) — so `<DataTable>` still runs client-side
 * pagination for search results specifically, same as before; only the
 * plain list path gets `serverPagination`.
 */
export default function StudentsPage() {
  const t = useTranslations("students");
  const tBulk = useTranslations("students.bulkImport");
  const tList = useTranslations("students.list");
  const [filters, setFilters] = React.useState<StudentFiltersValue>(EMPTY_STUDENT_FILTERS);
  const [bulkImportOpen, setBulkImportOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const columns = useStudentColumns();

  const isSearching = filters.search.trim().length > 0;
  const listQuery = useStudents({ classId: filters.classId ?? undefined, streamId: filters.streamId, status: filters.status ?? undefined, page, pageSize });
  const searchQuery = useStudentSearch(filters.search, 50);
  const activeQuery = isSearching ? searchQuery : listQuery;

  // Avoid landing on a now-out-of-range page (e.g. filtered down to 1 page
  // while sitting on page 3) whenever the filters/search term change — a
  // fresh filter is a genuinely different result set, page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [filters.classId, filters.streamId, filters.status, filters.search]);

  // `StudentsController_search` only accepts `q`/`limit` (confirmed by
  // reading students.controller.ts) — no classId/streamId/status params of
  // its own. When a search term is active, the class/stream/status filters
  // are applied CLIENT-SIDE on top of the search results instead, so one
  // screen can combine a name/admission-no search with a class/status
  // filter without a second bespoke endpoint.
  const filteredData = React.useMemo(() => {
    const rows = isSearching ? (searchQuery.data ?? []) : (listQuery.data?.items ?? []);
    if (!isSearching) return rows;
    return rows.filter(
      (s) => (!filters.classId || s.classId === filters.classId) && (!filters.streamId || s.streamId === filters.streamId) && (!filters.status || s.status === filters.status),
    );
  }, [isSearching, searchQuery.data, listQuery.data, filters.classId, filters.streamId, filters.status]);

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const serverPagination: ServerPaginationState | undefined = isSearching
    ? undefined
    : {
        page,
        pageSize,
        totalPages,
        onPageChange: setPage,
        onPageSizeChange: (newSize: number) => {
          setPageSize(newSize);
          setPage(1);
        },
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/students/classes">
              <Layers className="size-4" />
              {t("manageClasses")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
            <Upload className="size-4" />
            {tBulk("trigger")}
          </Button>
          <Button asChild>
            <Link href="/students/new">
              <Plus className="size-4" />
              {t("newStudent")}
            </Link>
          </Button>
        </div>
      </div>

      <StudentFilters value={filters} onChange={setFilters} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{tList("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary
            query={{
              isPending: activeQuery.isPending,
              isError: activeQuery.isError,
              error: activeQuery.error,
              data: filteredData,
              // `listQuery`'s real `refetch()` resolves a
              // `QueryObserverResult<ListStudentsResult>` ({items,total}),
              // `searchQuery`'s resolves `QueryObserverResult<StudentResponseDto[]>`
              // — neither literally matches `QueryBoundaryProps<StudentResponseDto[]>`'s
              // expected `refetch` return shape once `data` above is
              // overridden to the already-unwrapped/filtered array. `<QueryBoundary>`
              // only calls `refetch()` to trigger a re-fetch and discards the
              // return value (see its own "offline"/"error" cases), so this
              // is a narrow, documented cast, same pattern
              // `use-guardians.ts`'s `useStudentGuardians` already
              // established for the identical situation.
              refetch: activeQuery.refetch as unknown as () => Promise<QueryObserverResult<StudentResponseDto[], unknown>>,
            }}
            isEmpty={(d) => d.length === 0}
          >
            {(data) => <DataTable columns={columns} data={data} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
    </div>
  );
}
