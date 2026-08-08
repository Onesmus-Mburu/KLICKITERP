import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { NumberingPreviewResponse, NumberingSeriesResponse } from "../types";

/**
 * Thin wrapper over `NumberingController`
 * (`packages/server/src/platform/settings/api/numbering.controller.ts`) —
 * `settings:numbering-series:view` gates all 3 handlers (confirmed by
 * reading the controller directly; there is no `:manage` permission code
 * anywhere in the catalogue — this is genuinely a read-only inspection
 * surface by design, per that controller's own doc comment: allocation is
 * an internal service call, never a public HTTP mutation). Every response
 * here is hand-typed (see `../types.ts`) since none of the 3 handlers carry
 * an `@ApiResponse({type})` decorator.
 */
export async function listNumberingSeries(): Promise<NumberingSeriesResponse[]> {
  return unwrapApiResult<NumberingSeriesResponse[]>(await apiClient.GET("/api/v1/numbering-series"));
}

export async function getNumberingSeries(id: string): Promise<NumberingSeriesResponse> {
  return unwrapApiResult<NumberingSeriesResponse>(
    await apiClient.GET("/api/v1/numbering-series/{id}", { params: { path: { id } } }),
  );
}

/** `count` defaults to 3 server-side if omitted — this wrapper always sends it explicitly since every caller (the "Preview next N" dialog) always has a real count value by the time it calls this. */
export async function previewNumberingSeries(id: string, count: number): Promise<NumberingPreviewResponse> {
  return unwrapApiResult<NumberingPreviewResponse>(
    await apiClient.GET("/api/v1/numbering-series/{id}/preview", { params: { path: { id }, query: { count: String(count) } } }),
  );
}
