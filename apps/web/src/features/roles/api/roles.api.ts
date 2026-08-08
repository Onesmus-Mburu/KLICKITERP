import type { CreateRoleDto, GrantPermissionResultDto, PermissionResponseDto, RoleResponseDto, UpdateRoleDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `RolesController`
 * (`packages/server/src/platform/users/api/roles.controller.ts`) —
 * `users:role:view` covers list/get/listPermissions, `users:role:create`
 * covers create, `users:role:update` covers update, and
 * `users:role:assign-permission` covers grant/revoke (confirmed by reading
 * the controller directly). Response types (`RoleResponseDto`/
 * `PermissionResponseDto`/`GrantPermissionResultDto`) are real, generated
 * types imported directly from `@klickit/contracts` — no hand-typed
 * `types.ts` needed, made possible by Phase 6 Slice 13 Part 1's
 * response-DTO retrofit (the first frontend feature in this codebase to do
 * so for the Users/Roles/Permissions domain).
 */
export async function listRoles(): Promise<RoleResponseDto[]> {
  return unwrapApiResult<RoleResponseDto[]>(await apiClient.GET("/api/v1/roles"));
}

export async function getRole(id: string): Promise<RoleResponseDto> {
  return unwrapApiResult<RoleResponseDto>(await apiClient.GET("/api/v1/roles/{id}", { params: { path: { id } } }));
}

/**
 * A real, confirmed codegen gap on `isAuditorClass` specifically — the same
 * class of gap `features/settings/api/custom-fields.api.ts`'s own doc
 * comment documents for `options`: server-side, `CreateRoleDto.isAuditorClass`
 * is `@ApiPropertyOptional({default:false})` + `@IsOptional()` (genuinely
 * optional, confirmed by reading `create-role.dto.ts` directly, and
 * `@klickit/contracts`' own zod-inferred `CreateRoleDto` type correctly
 * mirrors that as `isAuditorClass?: boolean`) — but `@nestjs/swagger`
 * apparently drops the "optional" signal for this specific
 * `@ApiPropertyOptional({default})` shape when generating the OpenAPI
 * schema (confirmed directly in `generated/openapi-types.ts`:
 * `components["schemas"]["CreateRoleDto"]` has `isAuditorClass: boolean`,
 * no `?`), so the generated POST body type requires a non-optional boolean.
 * Every real caller of `createRole()` (`CreateRoleDialog`) already always
 * supplies a real `boolean` (its own local state defaults to `false`, never
 * `undefined`) — this `?? false` only satisfies the stricter generated type
 * at the boundary, matching the DTO's own documented `@default false`
 * semantics exactly, not inventing new behavior.
 */
export async function createRole(dto: CreateRoleDto): Promise<RoleResponseDto> {
  return unwrapApiResult<RoleResponseDto>(
    await apiClient.POST("/api/v1/roles", { body: { ...dto, isAuditorClass: dto.isAuditorClass ?? false } }),
  );
}

export async function updateRole(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
  return unwrapApiResult<RoleResponseDto>(await apiClient.PATCH("/api/v1/roles/{id}", { params: { path: { id } }, body: dto }));
}

export async function listRolePermissions(id: string): Promise<PermissionResponseDto[]> {
  return unwrapApiResult<PermissionResponseDto[]>(await apiClient.GET("/api/v1/roles/{id}/permissions", { params: { path: { id } } }));
}

/** Rejected (422) if the role is auditor-class and the permission is_write=true (BR-SEC-04), or if the resulting permission set violates an enabled SoD pair (FR-USER-009.1) — the real server message is surfaced verbatim by callers, not replaced with a generic fallback. */
export async function grantPermission(id: string, permissionCode: string): Promise<GrantPermissionResultDto> {
  return unwrapApiResult<GrantPermissionResultDto>(
    await apiClient.POST("/api/v1/roles/{id}/permissions", { params: { path: { id } }, body: { permissionCode } }),
  );
}

/**
 * Real `204`, no body — mirrors `deleteFeeStructure()`/`deleteStudent()`/
 * `deleteStream()`'s established DELETE-returns-void pattern across this
 * codebase (`const result = await apiClient.DELETE(...); unwrapApiResult<void>(result);`),
 * confirmed as the real convention by reading those call sites directly
 * before writing this one. `:code` (a colon-bearing permission code like
 * `billing:invoice:void`) round-trips through the URL path segment with no
 * escaping needed (confirmed live in Part 1's own verification — RFC 3986
 * compliant, colons aren't a path separator).
 */
export async function revokePermission(id: string, permissionCode: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/roles/{id}/permissions/{code}", { params: { path: { id, code: permissionCode } } });
  unwrapApiResult<void>(result);
}
