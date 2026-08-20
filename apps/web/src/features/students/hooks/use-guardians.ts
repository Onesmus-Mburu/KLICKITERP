"use client";

import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryObserverResult } from "@tanstack/react-query";
import type { CreateGuardianDto, GuardianResponseDto, LinkGuardianDto, StudentGuardianLinkResponseDto, StudentResponseDto, UpdateGuardianDto } from "@klickit/contracts";
import { getStudent } from "../api/students.api";
import { STUDENTS_QUERY_KEY } from "./use-students";
import {
  createGuardian,
  getGuardian,
  linkGuardianToStudent,
  listGuardianLinksForStudent,
  listGuardians,
  listStudentLinksForGuardian,
  unlinkGuardianFromStudent,
  updateGuardian,
} from "../api/guardians.api";

export interface GuardianWithLink {
  link: StudentGuardianLinkResponseDto;
  /** `undefined` only if the bulk guardian list and the student's link rows are momentarily out of sync (e.g. a guardian deleted from elsewhere mid-session) — no delete endpoint exists for guardians (see plan's scope note), so this is a defensive fallback, not an expected steady-state case. */
  guardian: GuardianResponseDto | undefined;
}

/**
 * The client-side join documented in the plan:
 * `GuardiansController_listForStudent` returns only link rows (no guardian
 * name/phone/email — confirmed by reading `guardian-response.schema.ts`'s
 * `StudentGuardianLinkResponseDtoSchema` vs `GuardianResponseDtoSchema`), so
 * this hook fetches BOTH the student's link rows AND the bulk (unpaginated)
 * guardian list ONCE, then indexes the latter by id — not N+1 per-guardian
 * calls. The combined result is shaped to match
 * `QueryBoundaryProps<T>["query"]` (`Pick<UseQueryResult<T>, "data" |
 * "isPending" | "isError" | "error" | "refetch">`) so `<QueryBoundary
 * query={useStudentGuardians(id)}>` works completely unmodified, same as
 * every single-query hook elsewhere in this app.
 */
export function useStudentGuardians(studentId: string | undefined) {
  const linksQuery = useQuery({
    queryKey: ["students", "guardian-links", studentId],
    queryFn: () => listGuardianLinksForStudent(studentId as string),
    enabled: !!studentId,
  });
  const guardiansQuery = useQuery({
    queryKey: GUARDIANS_QUERY_KEY,
    queryFn: listGuardians,
    enabled: !!studentId,
  });

  const data = React.useMemo<GuardianWithLink[] | undefined>(() => {
    if (!linksQuery.data || !guardiansQuery.data) return undefined;
    const byId = new Map(guardiansQuery.data.map((g) => [g.id, g]));
    return linksQuery.data.map((link) => ({ link, guardian: byId.get(link.guardianId) }));
  }, [linksQuery.data, guardiansQuery.data]);

  const refetch = React.useCallback(async (): Promise<QueryObserverResult<GuardianWithLink[], unknown>> => {
    const [linksResult] = await Promise.all([linksQuery.refetch(), guardiansQuery.refetch()]);
    // `<QueryBoundary>` only calls `query.refetch()` to trigger a re-fetch
    // and discards its return value (see query-boundary.tsx's "offline"/
    // "error" cases: `onClick={() => query.refetch()}`) — both underlying
    // queries have already genuinely refetched above by the time this
    // resolves; this cast only satisfies `UseQueryResult`'s return shape at
    // the type level, nothing reads the cast value at runtime.
    return linksResult as unknown as QueryObserverResult<GuardianWithLink[], unknown>;
  }, [linksQuery, guardiansQuery]);

  return {
    data,
    // Phase 6 Slice 10 (`query-boundary.tsx`'s own doc comment): `isPending`,
    // not `isLoading` — `<QueryBoundary>` now keys its "loading" state off
    // `isPending` (true whenever there's no data yet, whether or not a
    // fetch is actively in flight), matching TanStack Query v5's own
    // general "do I have data" flag.
    isPending: linksQuery.isPending || guardiansQuery.isPending,
    isError: linksQuery.isError || guardiansQuery.isError,
    error: linksQuery.error ?? guardiansQuery.error,
    refetch,
  };
}

export const GUARDIANS_QUERY_KEY = ["students", "guardians", "all"] as const;

export function useGuardians() {
  return useQuery({ queryKey: GUARDIANS_QUERY_KEY, queryFn: listGuardians });
}

export function useGuardian(id: string | undefined) {
  return useQuery({
    queryKey: [...GUARDIANS_QUERY_KEY, "detail", id],
    queryFn: () => getGuardian(id as string),
    enabled: !!id,
  });
}

/**
 * Standalone Parents page — create a `std_guardian` with NO student link
 * (unlike `useCreateAndLinkGuardian` below, which always creates-and-links in
 * one step for the student-detail-page flow). Still goes through the same
 * `POST /students/guardians` find-then-create-or-reuse dedup (see
 * `GuardiansService.create()`'s own doc comment) — a phone/email match
 * against an existing guardian returns that record instead of erroring, same
 * as every other caller of this endpoint.
 */
export function useCreateGuardianStandalone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateGuardianDto) => createGuardian(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY }),
  });
}

export function useUpdateGuardian(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateGuardianDto) => updateGuardian(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY });
    },
  });
}

export interface StudentWithGuardianLink {
  link: StudentGuardianLinkResponseDto;
  /** `undefined` only if this student was deleted (or the per-student fetch hasn't resolved yet) between the link-rows fetch and this join — see `guardian-section.tsx`'s own doc comment for the same defensive-fallback reasoning in reverse. */
  student: StudentResponseDto | undefined;
}

function guardianStudentLinksKey(guardianId: string) {
  return [...GUARDIANS_QUERY_KEY, "student-links", guardianId] as const;
}

/**
 * The reverse of `useStudentGuardians()` — a guardian's own children.
 * `GuardiansController_listForGuardian` (new route, see `guardians.api.ts`'s
 * own doc comment) returns only link rows, no student name/admission-no, so
 * this hook joins them against per-student detail fetches. Unlike
 * `useStudentGuardians()` (which bulk-fetches ALL guardians in one call,
 * since `GET /students/guardians` is a real unpaginated bare array),
 * `GET /students` IS paginated (`ListStudentsResult`, confirmed by reading
 * `listStudents()` directly) — a bulk fetch-and-join isn't safe here, so this
 * uses `useQueries` instead, one `getStudent()` per DISTINCT linked student
 * id, riding the exact same `[...STUDENTS_QUERY_KEY, "detail", id]` cache key
 * `useStudent()` itself uses (same "compose queries, don't call a hook
 * inside .map()" pattern `integrity-run-findings.tsx`'s own `usePeriodLabels`
 * already established) — bounded by how many children this guardian
 * actually has, never an unbounded scan.
 */
export function useGuardianStudentLinks(guardianId: string | undefined) {
  const linksQuery = useQuery({
    queryKey: guardianId ? guardianStudentLinksKey(guardianId) : guardianStudentLinksKey("__none__"),
    queryFn: () => listStudentLinksForGuardian(guardianId as string),
    enabled: !!guardianId,
  });

  const distinctStudentIds = React.useMemo(
    () => Array.from(new Set((linksQuery.data ?? []).map((l) => l.studentId))),
    [linksQuery.data],
  );
  const studentResults = useQueries({
    queries: distinctStudentIds.map((id) => ({
      queryKey: [...STUDENTS_QUERY_KEY, "detail", id] as const,
      queryFn: () => getStudent(id),
    })),
  });
  const studentById = React.useMemo(() => {
    const map = new Map<string, StudentResponseDto>();
    studentResults.forEach((result, index) => {
      if (result.data) map.set(distinctStudentIds[index], result.data);
    });
    return map;
  }, [studentResults, distinctStudentIds]);

  const data = React.useMemo<StudentWithGuardianLink[] | undefined>(() => {
    if (!linksQuery.data) return undefined;
    return linksQuery.data.map((link) => ({ link, student: studentById.get(link.studentId) }));
  }, [linksQuery.data, studentById]);

  const refetch = React.useCallback(async (): Promise<QueryObserverResult<StudentWithGuardianLink[], unknown>> => {
    const [linksResult] = await Promise.all([linksQuery.refetch(), ...studentResults.map((r) => r.refetch())]);
    // Same cast-only-at-the-return-boundary reasoning as `useStudentGuardians()`'s
    // own `refetch` above — `<QueryBoundary>` only calls this to trigger a
    // re-fetch and discards the return value; both underlying query sets have
    // already genuinely refetched above by the time this resolves.
    return linksResult as unknown as QueryObserverResult<StudentWithGuardianLink[], unknown>;
  }, [linksQuery, studentResults]);

  return {
    data,
    isPending: linksQuery.isPending,
    isError: linksQuery.isError,
    error: linksQuery.error,
    refetch,
  };
}

export function useLinkStudentToGuardian(guardianId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      relationship,
      isPrimary,
      receivesBilling,
    }: {
      studentId: string;
      relationship: string;
      isPrimary?: boolean;
      receivesBilling?: boolean;
    }) => linkGuardianToStudent(studentId, { guardianId, relationship, isPrimary, receivesBilling }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: guardianStudentLinksKey(guardianId) });
      queryClient.invalidateQueries({ queryKey: ["students", "guardian-links", variables.studentId] });
    },
  });
}

export function useUnlinkStudentFromGuardian(guardianId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => unlinkGuardianFromStudent(studentId, guardianId),
    onSuccess: (_data, studentId) => {
      queryClient.invalidateQueries({ queryKey: guardianStudentLinksKey(guardianId) });
      queryClient.invalidateQueries({ queryKey: ["students", "guardian-links", studentId] });
    },
  });
}

function invalidateStudentGuardians(queryClient: ReturnType<typeof useQueryClient>, studentId: string) {
  queryClient.invalidateQueries({ queryKey: ["students", "guardian-links", studentId] });
  queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY });
}

export function useLinkGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LinkGuardianDto) => linkGuardianToStudent(studentId, dto),
    onSuccess: () => invalidateStudentGuardians(queryClient, studentId),
  });
}

export function useUnlinkGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardianId: string) => unlinkGuardianFromStudent(studentId, guardianId),
    onSuccess: () => invalidateStudentGuardians(queryClient, studentId),
  });
}

/**
 * Composed `createGuardian()` + `linkGuardianToStudent()` — explicitly NOT
 * atomic across its two HTTP calls (no backend transaction spans both; this
 * is two independent `POST`s from the browser). If `create` succeeds but
 * `link` fails (network blip, a 409 on the link call, etc.), the guardian
 * row now exists unlinked — the caller gets a specific recovery error
 * message instead of a generic one, so the user knows to search for the
 * guardian by name and link manually rather than re-submitting the create
 * form (which would 409 on `phone` the second time).
 *
 * A plain async function, not a `useMutation` itself, SPECIFICALLY so it can
 * be called with a `studentId` that isn't known until AFTER a separate
 * mutation resolves (Phase 6 Slice 2b item 1's inline guardian section on
 * "New Student": the student doesn't exist — and has no id — until
 * `createStudent()` itself resolves inside the same submit handler, and
 * React hooks cannot be conditionally invoked with a not-yet-known id).
 * `useCreateAndLinkGuardian(studentId)` below (the pre-existing,
 * already-known-studentId call sites — `guardian-link-dialog.tsx`'s "new
 * guardian" tab) is now a thin `useMutation` wrapper around this SAME
 * function — reused, not duplicated — so both call sites share one real
 * implementation of the non-atomic-recovery logic.
 */
/**
 * Phase 6 Slice 2c — the `guardian` created/reused now carries `wasExisting`
 * (from `createGuardian()`'s `CreateGuardianResponseDto`), surfaced here as
 * a top-level field on this function's own return value so every call site
 * (`student-form.tsx`'s inline section, `guardian-link-dialog.tsx`'s "new
 * guardian" tab, `bulk-import-dialog.tsx`'s per-row guardian creation) can
 * show "New guardian created" vs. "Linked to existing guardian {fullName}"
 * without re-deriving it.
 */
export async function createAndLinkGuardian(
  studentId: string,
  guardianDto: CreateGuardianDto,
  linkDto: Omit<LinkGuardianDto, "guardianId">,
): Promise<{ guardian: GuardianResponseDto; wasExisting: boolean; link: StudentGuardianLinkResponseDto }> {
  const { wasExisting, ...guardian } = await createGuardian(guardianDto);
  try {
    const link = await linkGuardianToStudent(studentId, { ...linkDto, guardianId: guardian.id });
    return { guardian, wasExisting, link };
  } catch (linkError) {
    throw new GuardianLinkAfterCreateError(guardian, linkError, wasExisting);
  }
}

export function useCreateAndLinkGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianDto, linkDto }: { guardianDto: CreateGuardianDto; linkDto: Omit<LinkGuardianDto, "guardianId"> }) =>
      createAndLinkGuardian(studentId, guardianDto, linkDto),
    onSuccess: () => invalidateStudentGuardians(queryClient, studentId),
    onError: (error) => {
      // Even a partial failure (create succeeded, link failed) leaves a
      // real new guardian row in the bulk list — invalidate so the
      // guardian-link-dialog's "link existing" search can find it right away.
      if (error instanceof GuardianLinkAfterCreateError) {
        queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY });
      }
    },
  });
}

export class GuardianLinkAfterCreateError extends Error {
  constructor(
    public readonly guardian: GuardianResponseDto,
    public readonly cause: unknown,
    /** Phase 6 Slice 2c — was this guardian a freshly-created record, or an existing one reused via the phone/email dedup lookup? Changes the message's phrasing below ("was created" vs. "was found") so it stays accurate either way. */
    public readonly wasExisting: boolean = false,
  ) {
    super(
      wasExisting
        ? `Found an existing guardian (${guardian.fullName}) but linking failed — search for them and link manually`
        : `Guardian was created but linking failed — search for ${guardian.fullName} and link manually`,
    );
    this.name = "GuardianLinkAfterCreateError";
  }
}
