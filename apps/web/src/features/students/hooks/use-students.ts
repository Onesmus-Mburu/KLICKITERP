"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeStudentStatusDto, CreateStudentDto, UpdateStudentDto } from "@klickit/contracts";
import {
  changeStudentStatus,
  createStudent,
  deleteStudent,
  exitClearStudent,
  getStudent,
  listStudents,
  searchStudents,
  updateStudent,
  type ListStudentsParams,
} from "../api/students.api";

/**
 * `features/students/` is this slice's (Phase 6 Slice 2) new convention:
 * `dashboard/` (Slice 1) was flat (`hooks/use-dashboard.ts` +
 * `components/dashboard/*.tsx`) because it's one page of read-only widgets.
 * Students is a full CRUD vertical — list/search/detail/create/update/
 * status-change/exit-clear + a guardian sub-resource + read-only class/
 * stream/fee-group pickers + a ledger view, ~20 files — flat would have
 * meant a `hooks/use-students-*.ts`/`components/students-*.tsx` naming
 * scheme fighting the folder itself for organization. `features/<module>/
 * {api,hooks,components}` groups everything by module instead, and is the
 * shape every future CRUD module (the other ~14) should follow; `dashboard/`
 * is intentionally left as-is (not retrofitted) since it's still genuinely
 * flat-shaped content.
 */
export const STUDENTS_QUERY_KEY = ["students"] as const;

/**
 * Phase 6 Slice 2c — `params` (including `page`/`pageSize` now) stays the
 * whole query key, same as before this pass — a page/pageSize/filter change
 * is a genuinely different query, correctly triggering its own fetch/cache
 * entry rather than silently reusing a stale one.
 */
/**
 * Phase 6 Slice 8 — `options.enabled` is a new, additive, optional second
 * parameter (defaults to `true`, matching every existing call site's
 * behavior byte-for-byte since none of them pass it) — added for
 * `StudentSelectionGrid` (the bulk "Generate Invoice" screen's student
 * picker), which must not fire `GET /students` at all until a class has
 * been chosen (fetching the whole unscoped student list otherwise, wasteful
 * and momentarily wrong-shaped for that screen's own "select a class first"
 * empty state).
 */
export function useStudents(params: ListStudentsParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...STUDENTS_QUERY_KEY, "list", params],
    queryFn: () => listStudents(params),
    enabled: options.enabled ?? true,
  });
}

export function useStudentSearch(query: string, limit?: number) {
  return useQuery({
    queryKey: [...STUDENTS_QUERY_KEY, "search", query, limit],
    queryFn: () => searchStudents(query, limit),
    enabled: query.trim().length > 0,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: [...STUDENTS_QUERY_KEY, "detail", id],
    queryFn: () => getStudent(id as string),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStudentDto) => createStudent(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
    },
  });
}

export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateStudentDto) => updateStudent(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "detail", id] });
    },
  });
}

export function useChangeStudentStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ChangeStudentStatusDto) => changeStudentStatus(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "detail", id] });
    },
  });
}

export function useExitClearStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => exitClearStudent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "detail", id] });
    },
  });
}

/**
 * Real delete (Phase 6 Slice 2b — Student delete) — same shape as
 * `useDeleteClass()`/`useDeleteStream()`. Invalidates the list key so a
 * deleted student disappears from the table immediately; the detail-page
 * caller navigates away on success (the detail query's own data is now
 * gone), so its cache entry is left to go stale naturally rather than
 * explicitly invalidated here.
 */
export function useDeleteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStudent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
    },
  });
}
