import type { CreateDepartmentDto, DepartmentResponseDto, UpdateDepartmentDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `DepartmentsController`
 * (`packages/server/src/platform/users/api/departments.controller.ts`) —
 * `users:department:view` covers list/get, `users:department:create` covers
 * create, `users:department:update` covers update (confirmed by reading the
 * controller directly, ~55 lines). No delete wrapper exists here because no
 * delete route exists on the controller at all — this codebase's established
 * "no delete path exists, don't invent one" precedent for definitional rows
 * (mirrors `RolesController`'s own lack of a delete route, per
 * `features/roles/api/roles.api.ts`'s own doc comment). Response type
 * (`DepartmentResponseDto`) is a real, generated type imported directly from
 * `@klickit/contracts`, made possible by Phase 6 Slice 13 Part 1's
 * response-DTO retrofit — same precedent `features/roles/api/roles.api.ts`
 * already established for this same new domain.
 */
export async function listDepartments(): Promise<DepartmentResponseDto[]> {
  return unwrapApiResult<DepartmentResponseDto[]>(await apiClient.GET("/api/v1/departments"));
}

export async function getDepartment(id: string): Promise<DepartmentResponseDto> {
  return unwrapApiResult<DepartmentResponseDto>(await apiClient.GET("/api/v1/departments/{id}", { params: { path: { id } } }));
}

export async function createDepartment(dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
  return unwrapApiResult<DepartmentResponseDto>(await apiClient.POST("/api/v1/departments", { body: dto }));
}

/**
 * A real, confirmed codegen gap on `UpdateDepartmentDto.headUserId`
 * specifically — the same class of gap `features/settings/api/custom-fields.api.ts`'s
 * own doc comment documents for `options`. Server-side,
 * `UpdateDepartmentDto.headUserId` is declared
 * `@ApiPropertyOptional({ description: "null clears the head" })` (confirmed
 * by reading `update-department.dto.ts` directly) with NO `nullable: true` in
 * the decorator — `@nestjs/swagger` can't infer a `string | null` union from
 * a bare TS type without that flag, so the generated OpenAPI schema for this
 * property has no real shape, and `openapi-typescript` emits
 * `headUserId?: Record<string, never>` (an empty-object-only placeholder, no
 * `null` in the union at all) in `generated/openapi-types.ts` — confirmed
 * directly. That doesn't structurally match `@klickit/contracts`' own
 * zod-inferred `UpdateDepartmentDto` type
 * (`headUserId?: string | null | undefined`, correctly mirroring the real
 * class-validator rule `@IsOptional() @IsUUID()` applied to a `string | null`
 * field), which is what this function's own `dto` parameter resolves to.
 * Fixed the same way `custom-fields.api.ts`'s `updateCustomField()` fixes the
 * identical class of gap: a targeted `as unknown as {...}` cast at the one
 * call boundary that hits it, matching the REAL generated request shape
 * field-for-field — the real runtime JSON round-trips correctly either way
 * (this is a TypeScript-level annotation gap only, not a runtime bug; live
 * verification of `headUserId: null` genuinely clearing the column is in
 * docs/phase-6/PROGRESS.md's Slice 13 Part 3 section).
 */
interface UpdateDepartmentRequestBody {
  name?: string;
  headUserId?: Record<string, never>;
}

export async function updateDepartment(id: string, dto: UpdateDepartmentDto): Promise<DepartmentResponseDto> {
  return unwrapApiResult<DepartmentResponseDto>(
    await apiClient.PATCH("/api/v1/departments/{id}", { params: { path: { id } }, body: dto as unknown as UpdateDepartmentRequestBody }),
  );
}
