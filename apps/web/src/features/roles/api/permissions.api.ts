import type { PermissionResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over the new `PermissionsController`
 * (`packages/server/src/platform/users/api/permissions.controller.ts`,
 * Phase 6 Slice 13 Part 1) — `users:role:view`-gated, browses the full
 * permission catalogue (259 codes across 24 modules, confirmed live).
 * `module` is genuinely optional server-side (a real
 * `@ApiQuery({required:false})`, confirmed by reading the controller
 * directly) and correctly typed as an optional `string` in the generated
 * OpenAPI types too (`operations["PermissionsController_list"]["parameters"]["query"]`)
 * — no `optionalQuery()`/cast workaround needed here, unlike several other
 * query-param codegen gaps this codebase has documented elsewhere
 * (`lib/api-error.ts`'s own doc comment, `features/settings/api/query-params.ts`).
 */
export async function listPermissions(module?: string): Promise<PermissionResponseDto[]> {
  return unwrapApiResult<PermissionResponseDto[]>(
    await apiClient.GET("/api/v1/permissions", { params: { query: module ? { module } : {} } }),
  );
}
