import type { CreateStreamDto, StreamResponseDto, UpdateStreamDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `StreamsController`. `GET /students/streams` REQUIRES
 * `?classId=` server-side (`StreamsController.listByClass`'s
 * `@Query("classId") classId: string` has no default and
 * `StreamsService.listByClass` would query with `undefined` otherwise) —
 * enforced here by making `classId` a required parameter, not optional.
 * Phase 6 Slice 2b item 6 adds real create/update wrappers, same
 * "already-existed-server-side, never called from apps/web" story as
 * `classes.api.ts`'s.
 */
export async function listStreamsForClass(classId: string): Promise<StreamResponseDto[]> {
  return unwrapApiResult<StreamResponseDto[]>(
    await apiClient.GET("/api/v1/students/streams", { params: { query: { classId } } }),
  );
}

export async function createStream(dto: CreateStreamDto): Promise<StreamResponseDto> {
  return unwrapApiResult<StreamResponseDto>(await apiClient.POST("/api/v1/students/streams", { body: dto }));
}

export async function updateStream(id: string, dto: UpdateStreamDto): Promise<StreamResponseDto> {
  return unwrapApiResult<StreamResponseDto>(await apiClient.PATCH("/api/v1/students/streams/{id}", { params: { path: { id } }, body: dto }));
}

/** Real delete — `StreamsController.remove()` returns a real 204, no body; a genuine 409 (students still reference the stream) surfaces as an `ApiError` for the caller to render. */
export async function deleteStream(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/students/streams/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}
