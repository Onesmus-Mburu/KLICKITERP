"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAcademicYearDto, CreateTermDto, SetBillingLockDto, UpdateAcademicYearDto, UpdateTermDto } from "@klickit/contracts";
import {
  createAcademicYear,
  createTerm,
  getAcademicYear,
  getTerm,
  listAcademicYears,
  listTerms,
  setCurrentAcademicYear,
  setCurrentTerm,
  setTermBillingLock,
  updateAcademicYear,
  updateTerm,
} from "../api/academic-calendar.api";
import type { AcademicYearResponse, TermResponse } from "../types";

export const SETTINGS_ACADEMIC_YEARS_QUERY_KEY = ["settings", "academic-years"] as const;
export const SETTINGS_TERMS_QUERY_KEY = ["settings", "terms"] as const;

function yearDetailKey(id: string | undefined) {
  return [...SETTINGS_ACADEMIC_YEARS_QUERY_KEY, "detail", id] as const;
}
function termsListKey(academicYearId: string | undefined) {
  return [...SETTINGS_TERMS_QUERY_KEY, "list", academicYearId] as const;
}
function termDetailKey(id: string | undefined) {
  return [...SETTINGS_TERMS_QUERY_KEY, "detail", id] as const;
}

/** `settings:academic-year:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this feature. */
export function useAcademicYears() {
  return useQuery({ queryKey: SETTINGS_ACADEMIC_YEARS_QUERY_KEY, queryFn: listAcademicYears });
}

export function useAcademicYear(id: string | undefined) {
  return useQuery({ queryKey: yearDetailKey(id), queryFn: () => getAcademicYear(id as string), enabled: !!id });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAcademicYearDto) => createAcademicYear(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_ACADEMIC_YEARS_QUERY_KEY }),
  });
}

export function useUpdateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAcademicYearDto }) => updateAcademicYear(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_ACADEMIC_YEARS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: yearDetailKey(updated.id) });
    },
  });
}

/** Flips `isCurrent` — the mutation's own success handler invalidates the whole years list (not just this one row) since the PREVIOUS current year's `isCurrent` also flips server-side, atomically, and this hook has no way to know which row that was ahead of time. */
export function useSetCurrentAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setCurrentAcademicYear(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_ACADEMIC_YEARS_QUERY_KEY }),
  });
}

export function useTerms(academicYearId: string | undefined) {
  return useQuery({
    queryKey: termsListKey(academicYearId),
    queryFn: () => listTerms(academicYearId),
    enabled: !!academicYearId,
  });
}

export function useTerm(id: string | undefined) {
  return useQuery({ queryKey: termDetailKey(id), queryFn: () => getTerm(id as string), enabled: !!id });
}

export function useCreateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTermDto) => createTerm(dto),
    onSuccess: (created) => queryClient.invalidateQueries({ queryKey: termsListKey(created.academicYearId) }),
  });
}

export function useUpdateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTermDto }) => updateTerm(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: termsListKey(updated.academicYearId) });
      queryClient.invalidateQueries({ queryKey: termDetailKey(updated.id) });
    },
  });
}

/** Same "invalidate the whole scoped list, not just this row" reasoning as `useSetCurrentAcademicYear` — the previous current term (global, not scoped by year) also flips atomically server-side. Invalidates every `termsListKey(*)` (all years) since the previous current term could belong to a DIFFERENT academic year than the one being set now. */
export function useSetCurrentTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setCurrentTerm(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_TERMS_QUERY_KEY }),
  });
}

export function useSetTermBillingLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: SetBillingLockDto }) => setTermBillingLock(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: termsListKey(updated.academicYearId) });
      queryClient.invalidateQueries({ queryKey: termDetailKey(updated.id) });
    },
  });
}

/** Exactly one row has `isCurrent: true` per set (DB-enforced partial unique index) — duplicated from `features/billing/hooks/use-academic-calendar.ts` per this feature folder's own self-containment convention (see `../api/academic-calendar.api.ts`'s doc comment). */
export function findCurrent<T extends { isCurrent: boolean }>(rows: T[] | undefined): T | undefined {
  return rows?.find((row) => row.isCurrent);
}

export type { AcademicYearResponse, TermResponse };
