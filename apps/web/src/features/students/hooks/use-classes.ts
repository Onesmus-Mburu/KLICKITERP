"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClassDto, UpdateClassDto } from "@klickit/contracts";
import { createClass, deleteClass, listClasses, updateClass } from "../api/classes.api";

export const CLASSES_QUERY_KEY = ["students", "classes"] as const;

export function useClasses() {
  return useQuery({
    queryKey: CLASSES_QUERY_KEY,
    queryFn: listClasses,
  });
}

/**
 * Phase 6 Slice 2b item 6 — real create/update mutations for the new
 * Classes & Streams management page. Invalidates `CLASSES_QUERY_KEY` on
 * success so `<ClassStreamSelect>`'s cascading picker (used by the student
 * form/filters) sees a newly-created class immediately via a fresh query,
 * not a stale cache — the same `["students","classes"]` key both consume.
 */
export function useCreateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClassDto) => createClass(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY }),
  });
}

export function useUpdateClass(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateClassDto) => updateClass(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY }),
  });
}

/** Real delete — invalidates `CLASSES_QUERY_KEY` on success so the deleted class disappears from the table/picker immediately, matching every other mutation in this file. A blocked (409) delete leaves the cache untouched. */
export function useDeleteClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClass(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY }),
  });
}

/** `isActive`-filtered variant — `GET /students/classes` doesn't filter server-side (see `classes.api.ts`'s doc comment), so the create-student form's picker filters the same underlying query's data client-side instead of issuing a second HTTP call. */
export function useActiveClasses() {
  const query = useClasses();
  return {
    ...query,
    data: query.data?.filter((klass) => klass.isActive),
  };
}
