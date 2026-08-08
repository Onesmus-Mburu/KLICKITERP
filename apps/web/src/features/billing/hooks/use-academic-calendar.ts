"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAcademicYearDto, CreateTermDto } from "@klickit/contracts";
import { createAcademicYear, createTerm, listAcademicYears, listTerms } from "../api/academic-calendar.api";
import type { AcademicYearResponse, TermResponse } from "../types";

export const ACADEMIC_YEARS_QUERY_KEY = ["billing", "academic-years"] as const;

function termsQueryKey(academicYearId: string | undefined) {
  return ["billing", "terms", academicYearId] as const;
}

/** `settings:academic-year:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this feature. */
export function useAcademicYears() {
  return useQuery({
    queryKey: ACADEMIC_YEARS_QUERY_KEY,
    queryFn: listAcademicYears,
  });
}

export function useTerms(academicYearId: string | undefined) {
  return useQuery({
    queryKey: termsQueryKey(academicYearId),
    queryFn: () => listTerms(academicYearId),
    enabled: !!academicYearId,
  });
}

/** Phase 6 Slice 3b — the new Academic Year wizard's create-year step. Invalidates the years list so every picker in the app (this one included) sees the new year immediately. */
export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAcademicYearDto) => createAcademicYear(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY }),
  });
}

/** Phase 6 Slice 3b — the new Academic Year wizard's create-term step (called once per term). Invalidates that specific year's terms list. */
export function useCreateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTermDto) => createTerm(dto),
    onSuccess: (created) => queryClient.invalidateQueries({ queryKey: termsQueryKey(created.academicYearId) }),
  });
}

/** Exactly one row has `isCurrent: true` per set (DB-enforced partial unique index — see `../types.ts`'s doc comment) — pickers default-select it. `undefined` while loading/if genuinely none is marked current. */
export function findCurrent<T extends { isCurrent: boolean }>(rows: T[] | undefined): T | undefined {
  return rows?.find((row) => row.isCurrent);
}

export type { AcademicYearResponse, TermResponse };
