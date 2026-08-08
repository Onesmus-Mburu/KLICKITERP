import type { ChangeStudentStatusDto, CreateStudentDto, StudentResponseDto, UpdateStudentDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `StudentsController`'s 7 endpoints
 * (`packages/server/src/domains/students/api/students.controller.ts`),
 * using `lib/api-client.ts`'s existing auth-middleware-wrapped typed client
 * — no new HTTP plumbing, same pattern as `hooks/use-dashboard.ts`'s direct
 * `apiClient.GET(...)` calls, just relocated into a dedicated per-controller
 * file since Students has enough endpoints/hooks to warrant the split (see
 * `features/students/README` convention note in `use-students.ts`).
 */
export interface ListStudentsParams {
  classId?: string;
  streamId?: string | null;
  status?: string;
  /** Phase 6 Slice 2c — real server-side pagination (`PaginationQueryDto`, 1-based, default pageSize 20 server-side, max 200). */
  page?: number;
  pageSize?: number;
}

export interface ListStudentsResult {
  items: StudentResponseDto[];
  total: number;
}

/**
 * Phase 6 Slice 2c — real server-side pagination. `StudentsController_list`'s
 * generated query-param type (`packages/contracts/src/generated/openapi-types.ts`)
 * doesn't declare `page`/`pageSize` at all — a real, confirmed codegen gap:
 * NestJS/Swagger only auto-detects INDIVIDUALLY-named `@Query("x")` params
 * (like `classId`/`streamId`/`status` here, or `search()`'s `limit`), not
 * properties of a whole `@Query() pagination: PaginationQueryDto` object
 * param — confirmed by checking `UsersController_list`'s generated type,
 * which has the SAME gap (`departmentId`/`status` only, no `page`/
 * `pageSize`) for the exact same reason, so this isn't specific to Students.
 * `optionalQuery()`'s return type isn't tied to the endpoint's declared
 * query shape, so passing the extra `page`/`pageSize` keys here still
 * type-checks (structural typing permits extra properties on a non-literal
 * value) and the real backend genuinely reads them — same "type-level
 * workaround for a codegen gap, not a runtime issue" class as `optionalQuery`'s
 * own doc comment describes for `classId`/`streamId`/`status`.
 */
export async function listStudents(params: ListStudentsParams = {}): Promise<ListStudentsResult> {
  return unwrapApiResult<ListStudentsResult>(
    await apiClient.GET("/api/v1/students", {
      params: {
        query: optionalQuery({
          classId: params.classId,
          streamId: params.streamId ?? undefined,
          status: params.status,
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
        }),
      },
    }),
  );
}

export async function searchStudents(q: string, limit?: number): Promise<StudentResponseDto[]> {
  // `limit` is a real number param, but `StudentsController_search`'s
  // generated query-param type declares it `string` (same required-string
  // codegen quirk `optionalQuery` exists for) — over an actual HTTP
  // querystring every value is a string anyway, so stringifying here is
  // real, not a workaround-of-a-workaround.
  return unwrapApiResult<StudentResponseDto[]>(
    await apiClient.GET("/api/v1/students/search", {
      params: { query: optionalQuery({ q, limit: limit !== undefined ? String(limit) : undefined }) },
    }),
  );
}

export async function getStudent(id: string): Promise<StudentResponseDto> {
  return unwrapApiResult<StudentResponseDto>(await apiClient.GET("/api/v1/students/{id}", { params: { path: { id } } }));
}

export async function createStudent(dto: CreateStudentDto): Promise<StudentResponseDto> {
  return unwrapApiResult<StudentResponseDto>(await apiClient.POST("/api/v1/students", { body: dto }));
}

export async function updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
  return unwrapApiResult<StudentResponseDto>(await apiClient.PATCH("/api/v1/students/{id}", { params: { path: { id } }, body: dto }));
}

export async function changeStudentStatus(id: string, dto: ChangeStudentStatusDto): Promise<StudentResponseDto> {
  return unwrapApiResult<StudentResponseDto>(await apiClient.POST("/api/v1/students/{id}/status", { params: { path: { id } }, body: dto }));
}

export async function exitClearStudent(id: string): Promise<StudentResponseDto> {
  return unwrapApiResult<StudentResponseDto>(await apiClient.POST("/api/v1/students/{id}/exit-clear", { params: { path: { id } } }));
}

/**
 * Real delete (Phase 6 Slice 2b — Student delete). `StudentsController.remove()`
 * returns a real 204, no body; a genuine 409 (real financial/cross-module
 * reference — ledger entries, invoices, receipts, etc. — still exists)
 * surfaces as an `ApiError` for the caller to render, same shape as
 * `deleteClass()`/`deleteStream()`.
 */
export async function deleteStudent(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/students/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}
