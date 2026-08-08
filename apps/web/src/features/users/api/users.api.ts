import type {
  AssignDepartmentDto,
  AssignRoleResultDto,
  CreateUserDto,
  CreateUserResponseDto,
  RoleResponseDto,
  SetAuthorityLimitDto,
  UpdateUserDto,
  UserListResponseDto,
  UserResponseDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `UsersController`
 * (`packages/server/src/platform/users/api/users.controller.ts`, ~189 lines,
 * all 15 routes already carry `@ApiResponse`+`toView()` mapping from Phase 6
 * Slice 13 Part 1 — confirmed by reading it directly, no secret fields
 * (`passwordHash`/`twofaSecretEnc`/`recoveryCodesEnc`) ever leak). Response
 * types are real, generated types imported directly from `@klickit/contracts`
 * — same precedent `features/roles/api/roles.api.ts`/`features/departments/
 * api/departments.api.ts` already established for this same domain.
 *
 * **A real, confirmed codegen gap on `CreateUserDto.locale` specifically** —
 * the same class of gap `features/roles/api/roles.api.ts` documents for
 * `isAuditorClass`: server-side, `locale` is genuinely optional
 * (`@ApiPropertyOptional()` + `@IsOptional()`, and `@klickit/contracts`' own
 * zod-inferred `CreateUserDto` type correctly has `locale?: string`,
 * confirmed by reading `create-user.schema.ts` directly), but the generated
 * OpenAPI request-body type (`components["schemas"]["CreateUserDto"]`) has
 * it as a required `string` (confirmed directly against `tsc`'s own error —
 * every OTHER field on this same DTO round-trips its optionality correctly).
 * `UsersService.create()` already defaults a missing `locale` to `"en"`
 * server-side (confirmed by reading it directly:
 * `locale: input.locale ?? "en"`) — mirroring that exact default at this one
 * call boundary satisfies the stricter generated type without inventing new
 * behavior.
 */
export async function createUser(dto: CreateUserDto): Promise<CreateUserResponseDto> {
  return unwrapApiResult<CreateUserResponseDto>(
    await apiClient.POST("/api/v1/users", { body: { ...dto, locale: dto.locale ?? "en" } }),
  );
}

/**
 * `UsersController_list`'s generated query-param type: `page`/`pageSize` are
 * real, correctly-typed optional numbers (Part 1's `@ApiQuery` fix), but
 * `departmentId`/`status` are still declared as required `string`s (the
 * pre-existing, un-decorated-`@Query()`-param codegen quirk `optionalQuery()`'s
 * own doc comment documents) — confirmed directly against
 * `generated/openapi-types.ts` before writing this. Passing all four keys
 * through `optionalQuery()` (even when some are `undefined`) keeps its
 * inferred return type's key set complete, so the call below type-checks
 * against the generated query shape with NO hand-written cast-target
 * interface needed — unlike `features/departments/api/users-lookup.api.ts`'s
 * `UsersLookupQueryShape`, which only ever supplies `pageSize` and so DOES
 * need one (a real, deliberate difference, not an oversight).
 */
export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  departmentId?: string;
  status?: string;
  /** ILIKE substring match against username/fullName/email/phone — a real `@ApiQuery`-annotated optional param (added alongside this search field), unlike `departmentId`/`status` above. */
  q?: string;
}

export async function listUsers(params: ListUsersParams = {}): Promise<UserListResponseDto> {
  return unwrapApiResult<UserListResponseDto>(
    await apiClient.GET("/api/v1/users", {
      params: {
        query: optionalQuery({
          page: params.page,
          pageSize: params.pageSize,
          departmentId: params.departmentId,
          status: params.status,
          q: params.q,
        }),
      },
    }),
  );
}

export async function getUser(id: string): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(await apiClient.GET("/api/v1/users/{id}", { params: { path: { id } } }));
}

export async function updateUser(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(await apiClient.PATCH("/api/v1/users/{id}", { params: { path: { id } }, body: dto }));
}

/** No-body verb endpoints — the 3 real state-machine transitions (`ALLOWED_TRANSITIONS`, `UsersService`), confirmed real `requestBody?: never` in the generated operation type, same shape `revokePermission()`'s DELETE-no-body call already established for this domain. */
export async function suspendUser(id: string): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(await apiClient.PATCH("/api/v1/users/{id}/suspend", { params: { path: { id } } }));
}

export async function reactivateUser(id: string): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(await apiClient.PATCH("/api/v1/users/{id}/reactivate", { params: { path: { id } } }));
}

export async function deactivateUser(id: string): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(await apiClient.PATCH("/api/v1/users/{id}/deactivate", { params: { path: { id } } }));
}

/**
 * Two more real, confirmed codegen gaps, same class as
 * `features/departments/api/departments.api.ts`'s own
 * `UpdateDepartmentRequestBody` doc comment documents for
 * `UpdateDepartmentDto.headUserId`: `AssignDepartmentDto.departmentId`
 * (`string | null | undefined`) and `SetAuthorityLimitDto.amount`
 * (`string | null | undefined`) are both genuinely nullable server-side
 * (`@ApiPropertyOptional()` with no explicit `nullable: true`/`type: String`
 * on a bare `| null` TS union — `@nestjs/swagger` can't infer the union from
 * reflection alone), so the generated OpenAPI request-body types drop `null`
 * from both unions entirely. Fixed the same way: a local interface matching
 * the REAL generated (wrong) shape + `as unknown as {...}` cast at the one
 * call boundary that hits it — the real runtime JSON round-trips correctly
 * either way (this is a TypeScript-level annotation gap only, not a runtime
 * bug; live verification that `null` genuinely clears both fields is in
 * this part's own PROGRESS.md section).
 */
interface AssignDepartmentRequestBody {
  departmentId?: Record<string, never>;
}
interface SetAuthorityLimitRequestBody {
  amount?: Record<string, never>;
}

export async function assignDepartment(id: string, dto: AssignDepartmentDto): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(
    await apiClient.PATCH("/api/v1/users/{id}/department", {
      params: { path: { id } },
      body: dto as unknown as AssignDepartmentRequestBody,
    }),
  );
}

export async function setAuthorityLimit(id: string, dto: SetAuthorityLimitDto): Promise<UserResponseDto> {
  return unwrapApiResult<UserResponseDto>(
    await apiClient.PATCH("/api/v1/users/{id}/authority-limit", {
      params: { path: { id } },
      body: dto as unknown as SetAuthorityLimitRequestBody,
    }),
  );
}

export async function listUserRoles(id: string): Promise<RoleResponseDto[]> {
  return unwrapApiResult<RoleResponseDto[]>(await apiClient.GET("/api/v1/users/{id}/roles", { params: { path: { id } } }));
}

export async function assignRoleToUser(id: string, roleId: string): Promise<AssignRoleResultDto> {
  return unwrapApiResult<AssignRoleResultDto>(
    await apiClient.POST("/api/v1/users/{id}/roles", { params: { path: { id } }, body: { roleId } }),
  );
}

/** Real `204`, no body — same established DELETE-returns-void convention `revokePermission()` (`features/roles/api/roles.api.ts`) already documents for this domain. */
export async function unassignRoleFromUser(id: string, roleId: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/users/{id}/roles/{roleId}", { params: { path: { id, roleId } } });
  unwrapApiResult<void>(result);
}
