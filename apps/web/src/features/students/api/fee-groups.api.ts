import type { FeeGroupResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/** Thin wrapper over `FeeGroupsController` (READ-only, same reasoning as `classes.api.ts`). Unpaginated bare array, same as every other Module 8 list endpoint. */
export async function listFeeGroups(): Promise<FeeGroupResponseDto[]> {
  return unwrapApiResult<FeeGroupResponseDto[]>(await apiClient.GET("/api/v1/students/fee-groups"));
}
