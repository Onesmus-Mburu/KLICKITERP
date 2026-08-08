import type { ClassResponseDto, CreateClassDto, UpdateClassDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `ClassesController`. Originally READ-only (Phase 6
 * Slice 2 — pickers only, no class/stream CRUD UI). Phase 6 Slice 2b item 6
 * adds real create/update wrappers — `ClassesController.create()`/`.update()`
 * already existed server-side (confirmed by reading `classes.controller.ts`
 * before this pass), just never called from `apps/web` until now. `GET
 * /students/classes` does NOT filter `isActive` server-side (confirmed by
 * reading `classes.controller.ts`/`ClassesService.list()` — no filter param
 * accepted at all) — callers that want only active classes (e.g. the
 * create-student form's picker) filter client-side on the already-fetched
 * array; the list/detail screens still want to see inactive classes too, so
 * this file exposes the raw list.
 */
export async function listClasses(): Promise<ClassResponseDto[]> {
  return unwrapApiResult<ClassResponseDto[]>(await apiClient.GET("/api/v1/students/classes"));
}

export async function createClass(dto: CreateClassDto): Promise<ClassResponseDto> {
  return unwrapApiResult<ClassResponseDto>(await apiClient.POST("/api/v1/students/classes", { body: dto }));
}

export async function updateClass(id: string, dto: UpdateClassDto): Promise<ClassResponseDto> {
  return unwrapApiResult<ClassResponseDto>(await apiClient.PATCH("/api/v1/students/classes/{id}", { params: { path: { id } }, body: dto }));
}

/**
 * Real delete (added when the user asked for it after the leftover-test-data
 * clutter this whole Phase 6 effort's own live-verification passes never
 * cleaned up made the list unusable) — `ClassesController.remove()` returns
 * a real 204, no body; a genuine 409 (students/streams still reference the
 * class) surfaces as an `ApiError` for the caller to render.
 */
export async function deleteClass(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/students/classes/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}
