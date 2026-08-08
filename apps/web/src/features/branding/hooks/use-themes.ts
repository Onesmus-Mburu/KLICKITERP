"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateThemeDto } from "@klickit/contracts";
import {
  createTheme,
  getTheme,
  listThemes,
  previewTheme,
  publishTheme,
  revertTheme,
  updateTheme,
  type UpdateThemePayload,
} from "../api/themes.api";

/** `["branding","themes"]` query-key convention, mirroring `features/users/hooks/use-users.ts`'s `USERS_QUERY_KEY`/`listKey`/`detailKey` shape exactly. */
export const THEMES_QUERY_KEY = ["branding", "themes"] as const;

function listKey() {
  return [...THEMES_QUERY_KEY, "list"] as const;
}
function detailKey(id: string | undefined) {
  return [...THEMES_QUERY_KEY, "detail", id] as const;
}
function previewKey(id: string | undefined) {
  return [...THEMES_QUERY_KEY, "preview", id] as const;
}

/** `branding:theme:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched, same as every other hook in this codebase. */
export function useThemes() {
  return useQuery({ queryKey: listKey(), queryFn: () => listThemes() });
}

export function useTheme(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTheme(id as string), enabled: !!id });
}

/** `branding:theme:manage`-gated — invalidates the list only, same reasoning as `useCreateUser` (a brand-new theme has no detail-query cache entry yet). */
export function useCreateTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateThemeDto) => createTheme(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY }),
  });
}

/** Diff-based submit at the call site (`theme-editor-form.tsx`) — invalidates both the list (status/name shown there) and this theme's own detail cache, mirroring `useUpdateUser`. */
export function useUpdateTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateThemePayload }) => updateTheme(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

/**
 * `branding:theme:publish`-gated. Invalidates the WHOLE `["branding",
 * "themes"]` prefix (list + every detail + every preview key), not just
 * this theme's own detail entry — publishing changes both THIS theme's
 * status AND (atomically, server-side) the PREVIOUSLY-published theme's
 * status to `ARCHIVED`, and this hook has no way to know which row that was
 * ahead of time. Same "invalidate the whole scoped query, not just one row"
 * reasoning as `useSetCurrentAcademicYear`/`useSetCurrentTerm`
 * (`features/settings/hooks/use-academic-calendar.ts`).
 */
export function usePublishTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishTheme(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY }),
  });
}

/** Same broad-invalidation reasoning as `usePublishTheme` — `revert()` is the identical atomic unset-then-set swap, just in the other direction (`ARCHIVED` -> `PUBLISHED`). */
export function useRevertTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revertTheme(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY }),
  });
}

/** `branding:theme:view`-gated, works for ANY theme status, no side effects server-side — safe to cache normally like any other `useQuery`. */
export function usePreviewTheme(id: string | undefined) {
  return useQuery({ queryKey: previewKey(id), queryFn: () => previewTheme(id as string), enabled: !!id });
}
