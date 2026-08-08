import type { CreateThemeDto, CurrentThemeResponseDto, ThemeResponseDto, UpdateThemeDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `ThemesController`'s CRUD routes
 * (`packages/server/src/platform/branding/api/themes.controller.ts`).
 *
 * Part 1 covered 4 of the controller's 7 routes. Part 2 (this pass) adds the
 * remaining 3 — `publishTheme`/`revertTheme`/`previewTheme` — completing the
 * draft -> preview -> publish -> revert workflow. `GET /branding/theme/
 * current` remains deliberately NOT wrapped here — `lib/theme-server.ts`/
 * `app/api/theme/route.ts` already own that public, no-auth route.
 */
export async function createTheme(dto: CreateThemeDto): Promise<ThemeResponseDto> {
  return unwrapApiResult<ThemeResponseDto>(await apiClient.POST("/api/v1/branding/themes", { body: dto }));
}

/** `GET /branding/themes` is unpaginated (small, unbounded set — confirmed directly against `ThemesController.list()`), so no query params. */
export async function listThemes(): Promise<ThemeResponseDto[]> {
  return unwrapApiResult<ThemeResponseDto[]>(await apiClient.GET("/api/v1/branding/themes"));
}

export async function getTheme(id: string): Promise<ThemeResponseDto> {
  return unwrapApiResult<ThemeResponseDto>(
    await apiClient.GET("/api/v1/branding/themes/{id}", { params: { path: { id } } }),
  );
}

/**
 * **A real, confirmed codegen gap on `UpdateThemeDto.{logoFileId,
 * faviconFileId}` — the OPPOSITE direction from every other codegen gap
 * documented in this codebase so far.** Server-side, both fields are
 * genuinely nullable (`update-theme.dto.ts`: `@ApiPropertyOptional({
 * format:"uuid", nullable:true })` + `@IsOptional() @IsUUID()`), and the
 * GENERATED OpenAPI request-body type correctly reflects that
 * (`logoFileId?: string | null`, confirmed directly against
 * `generated/openapi-types.ts`'s `UpdateThemeDto` schema entry) — but
 * `@klickit/contracts`' zod-mirror generator dropped `.nullable()` when
 * producing `UpdateThemeDtoSchema` (confirmed directly:
 * `logoFileId: z.string().uuid().optional()`, no `.nullable()`), so its
 * inferred `UpdateThemeDto` TS type is `logoFileId?: string` — no `null`.
 * This only matters when explicitly CLEARING a previously-set file
 * reference. `UpdateThemePayload` is a local, narrow override restoring the
 * real `string | null | undefined` shape for exactly these two fields —
 * structurally IDENTICAL to the real generated OpenAPI type, so passing it
 * to `apiClient.PATCH` needs no cast at all (unlike the `as unknown as X`
 * casts this same three-way-diff pattern needs elsewhere in this codebase,
 * e.g. `users.api.ts`'s `assignDepartment`/`setAuthorityLimit` — those close
 * a gap in the OPPOSITE direction, where the GENERATED type is the one
 * missing `null`).
 */
export type UpdateThemePayload = Omit<UpdateThemeDto, "logoFileId" | "faviconFileId"> & {
  logoFileId?: string | null;
  faviconFileId?: string | null;
};

export async function updateTheme(id: string, dto: UpdateThemePayload): Promise<ThemeResponseDto> {
  return unwrapApiResult<ThemeResponseDto>(
    await apiClient.PATCH("/api/v1/branding/themes/{id}", { params: { path: { id } }, body: dto }),
  );
}

/**
 * Archives the previously-published theme (if any) and publishes this one,
 * atomically — a no-op if already `PUBLISHED` (`ThemesService.publish()`).
 * No request body, mirroring `academic-calendar.api.ts`'s
 * `setCurrentAcademicYear`'s identical no-body `POST .../set-current` shape.
 */
export async function publishTheme(id: string): Promise<ThemeResponseDto> {
  return unwrapApiResult<ThemeResponseDto>(
    await apiClient.POST("/api/v1/branding/themes/{id}/publish", { params: { path: { id } } }),
  );
}

/** Re-publishes a previously `ARCHIVED` theme — 422 for any other status (`ThemesService.revert()`). */
export async function revertTheme(id: string): Promise<ThemeResponseDto> {
  return unwrapApiResult<ThemeResponseDto>(
    await apiClient.POST("/api/v1/branding/themes/{id}/revert", { params: { path: { id } } }),
  );
}

/** No side effects — resolves ANY theme (any status) to its CSS-variable/config bundle for FR-BRND-002.1's Draft -> Preview step. */
export async function previewTheme(id: string): Promise<CurrentThemeResponseDto> {
  return unwrapApiResult<CurrentThemeResponseDto>(
    await apiClient.GET("/api/v1/branding/themes/{id}/preview", { params: { path: { id } } }),
  );
}
