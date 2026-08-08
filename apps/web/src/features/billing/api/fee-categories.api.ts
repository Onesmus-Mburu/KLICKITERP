import type { CreateFeeCategoryDto, FeeCategoryResponseDto, UpdateFeeCategoryDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `FeeCategoriesController`
 * (`packages/server/src/domains/billing/api/fee-categories.controller.ts`) —
 * `POST/GET/GET:id/PATCH/:id/deactivate/:id/activate`, permissions
 * `billing:fee-category:manage`/`:view`. No delete endpoint exists (confirmed
 * by reading the controller) — activate/deactivate toggle only, matching the
 * Classes/Streams precedent `features/students/api/classes.api.ts` originally
 * shipped with before that module later grew a real delete (this module has
 * no such endpoint to wrap even if it wanted to).
 */
export async function listFeeCategories(): Promise<FeeCategoryResponseDto[]> {
  return unwrapApiResult<FeeCategoryResponseDto[]>(await apiClient.GET("/api/v1/billing/fee-categories"));
}

export async function getFeeCategory(id: string): Promise<FeeCategoryResponseDto> {
  return unwrapApiResult<FeeCategoryResponseDto>(
    await apiClient.GET("/api/v1/billing/fee-categories/{id}", { params: { path: { id } } }),
  );
}

export async function createFeeCategory(dto: CreateFeeCategoryDto): Promise<FeeCategoryResponseDto> {
  return unwrapApiResult<FeeCategoryResponseDto>(await apiClient.POST("/api/v1/billing/fee-categories", { body: dto }));
}

export async function updateFeeCategory(id: string, dto: UpdateFeeCategoryDto): Promise<FeeCategoryResponseDto> {
  return unwrapApiResult<FeeCategoryResponseDto>(
    await apiClient.PATCH("/api/v1/billing/fee-categories/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function deactivateFeeCategory(id: string): Promise<FeeCategoryResponseDto> {
  return unwrapApiResult<FeeCategoryResponseDto>(
    await apiClient.POST("/api/v1/billing/fee-categories/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateFeeCategory(id: string): Promise<FeeCategoryResponseDto> {
  return unwrapApiResult<FeeCategoryResponseDto>(
    await apiClient.POST("/api/v1/billing/fee-categories/{id}/activate", { params: { path: { id } } }),
  );
}
