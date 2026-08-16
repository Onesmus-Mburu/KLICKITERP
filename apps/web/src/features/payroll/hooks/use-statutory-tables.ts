"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePyrlStatutoryTableDto, PyrlStatutoryTableResponseDto, UpdatePyrlStatutoryTableDto } from "@klickit/contracts";
import {
  createStatutoryTable,
  getEffectiveStatutoryTable,
  getStatutoryTable,
  listStatutoryTables,
  updateStatutoryTable,
} from "../api/statutory-tables.api";
import type { PyrlStatutoryKind } from "../lib/statutory-params";

/** `["payroll", "statutory-tables"]` query-key root, mirroring every other Payroll feature hook's own convention (`use-components.ts`/`use-salary-structures.ts`). */
export const PAYROLL_STATUTORY_TABLES_QUERY_KEY = ["payroll", "statutory-tables"] as const;

function listKey(kind: PyrlStatutoryKind) {
  return [...PAYROLL_STATUTORY_TABLES_QUERY_KEY, "list", kind] as const;
}

function detailKey(id: string | undefined) {
  return [...PAYROLL_STATUTORY_TABLES_QUERY_KEY, "detail", id] as const;
}

function effectiveKey(kind: PyrlStatutoryKind, periodEndDate: string | undefined) {
  return [...PAYROLL_STATUTORY_TABLES_QUERY_KEY, "effective", kind, periodEndDate] as const;
}

/** `payroll:statutory-table:manage`-gated — the ONE shared permission every route on `StatutoryTablesController` uses, including this list. `kind` is a REQUIRED param (no "all kinds" list exists server-side, see `statutory-tables.api.ts`'s own doc comment), so this hook always fetches — there is no `enabled` gate here, unlike the id-scoped hooks below. */
export function useStatutoryTables(kind: PyrlStatutoryKind) {
  return useQuery({ queryKey: listKey(kind), queryFn: () => listStatutoryTables(kind) });
}

export function useStatutoryTable(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getStatutoryTable(id as string), enabled: !!id });
}

/**
 * BR-PYRL-01's own lookup — "what table applies on this date" — backs
 * `effective-table-lookup.tsx`'s own utility panel. Only enabled once a
 * `periodEndDate` is actually chosen; a real `404` (no table effective for
 * that date) surfaces as `query.error` with `status: 404` — the panel
 * itself renders that as a clear "no table configured on or before this
 * date" message rather than the generic `<QueryBoundary>` error state
 * (see that component's own doc comment for why it handles the 404 case
 * specially instead of reusing `<QueryBoundary>` directly).
 */
export function useEffectiveStatutoryTable(kind: PyrlStatutoryKind, periodEndDate: string | undefined) {
  return useQuery({
    queryKey: effectiveKey(kind, periodEndDate),
    queryFn: () => getEffectiveStatutoryTable(kind, periodEndDate as string),
    enabled: !!periodEndDate,
    retry: false,
  });
}

function invalidateStatutoryTableQueries(queryClient: ReturnType<typeof useQueryClient>, kind: PyrlStatutoryKind, id?: string) {
  queryClient.invalidateQueries({ queryKey: listKey(kind) });
  queryClient.invalidateQueries({ queryKey: [...PAYROLL_STATUTORY_TABLES_QUERY_KEY, "effective", kind] });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

/** Surfaces the real 409 from this part's own opportunistic backend fix (`(kind, effectiveFrom)` uniqueness) verbatim via `ApiError.message` on a duplicate — see `statutory-tables.api.ts`'s own doc comment. */
export function useCreateStatutoryTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePyrlStatutoryTableDto) => createStatutoryTable(dto),
    onSuccess: (created) => invalidateStatutoryTableQueries(queryClient, created.kind as PyrlStatutoryKind, created.id),
  });
}

export function useUpdateStatutoryTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePyrlStatutoryTableDto }) => updateStatutoryTable(id, dto),
    onSuccess: (updated) => invalidateStatutoryTableQueries(queryClient, updated.kind as PyrlStatutoryKind, updated.id),
  });
}

export type { PyrlStatutoryTableResponseDto };
