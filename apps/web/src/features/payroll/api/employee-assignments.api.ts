import type { AssignEmployeeDto, EndAssignmentDto, PyrlEmployeeAssignmentResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — thin wrapper over
 * `EmployeeAssignmentsController`
 * (`packages/server/src/domains/payroll/api/employee-assignments.controller.ts`,
 * base `/api/v1/payroll/employee-assignments`, tag
 * `payroll-employee-assignments`) — a SINGLE shared `payroll:assignment:manage`
 * permission gates ALL 4 routes (no `:view` split, confirmed by reading the
 * controller directly), the same "one shared permission, no separate view
 * code" shape `salary-structures.api.ts` already established for Part 2.
 * **Every route here is genuinely scoped to one `employeeId` — there is no
 * global "list every assignment across every employee" endpoint** (confirmed
 * by reading the controller: `listByEmployee`/`getActiveFor` both take a
 * required `employeeId` query param), matching this part's own task brief on
 * why no new top-level nav route was added for this feature.
 *
 * **Zero request-body codegen gaps — checked directly, not assumed**:
 * `AssignEmployeeDtoSchema`/`EndAssignmentDtoSchema` (the zod-inferred types
 * from `@klickit/contracts`) both generate cleanly against
 * `AssignEmployeeDto`/`EndAssignmentDto` (`employee-assignment.dto.ts`) — no
 * enum-losing `@IsString()` field exists on either DTO (unlike Part 1's own
 * `kind`/`employmentType` finding), so both `assignEmployee()`/`endAssignment()`
 * below pass their `dto` straight through with no `as unknown as` cast.
 *
 * **One response-side gap exists, absorbed for free**: the RAW generated
 * `openapi-types.ts` types `PyrlEmployeeAssignmentResponseDto.effectiveTo` as
 * `Record<string, never> | null` (`effectiveTo!: string | null` on the class
 * has no explicit `type:` hint for `@nestjs/swagger`'s reflection to pick up
 * — the same nullable-without-a-primitive-type-hint gap `salary-structures.api.ts`'s
 * own `grade` finding, and `lib/api-error.ts`'s own doc comment, already
 * document elsewhere in this codebase). The zod-inferred
 * `PyrlEmployeeAssignmentResponseDto` (used directly below as every read
 * function's return type, per `employees.api.ts`'s own precedent) gets this
 * right (`effectiveTo: z.string().nullable()`), and `unwrapApiResult<T>()`'s
 * `data: unknown` parameter absorbs the raw-type mismatch for free — no local
 * interface-plus-cast needed.
 *
 * **The real no-overlap conflict is a clean `409`, not a raw `500`** — see
 * `EmployeeAssignmentsService`'s own doc comment: `assign()` relies on the DB's
 * own `excl_pyrl_employee_assignment_no_overlap` EXCLUDE constraint and
 * translates the `23P01` (exclusion_violation — NOT `23505` unique_violation)
 * it raises into a real `ConflictException`, message exactly
 * `` `pyrl_employee_assignment: overlapping assignment period for employee ${employeeId}` ``.
 * Nothing to fix here — `assignEmployee()` below surfaces `ApiError.message`
 * verbatim on a caught 409, same as every other clean-409 case in this
 * codebase.
 *
 * **No direct "replace" endpoint — a genuine 2-call workflow**: changing an
 * employee's structure/basic-pay requires `endAssignment()` (closes the
 * currently open-ended row) THEN `assignEmployee()` (creates the new one) —
 * see `employee-assignment-panel.tsx`'s own doc comment for the UI shape this
 * drives (an explicit "End current assignment" action, separate from "New
 * assignment," not a single fake "change structure" button).
 */
export async function listEmployeeAssignments(employeeId: string): Promise<PyrlEmployeeAssignmentResponseDto[]> {
  return unwrapApiResult<PyrlEmployeeAssignmentResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/employee-assignments", { params: { query: { employeeId } } }),
  );
}

/** `null` if no assignment covers `date` — confirmed by reading `getActiveFor()` directly (`row ? toView(row) : null`), not a client-side guess. */
export async function getActiveEmployeeAssignment(employeeId: string, date: string): Promise<PyrlEmployeeAssignmentResponseDto | null> {
  return unwrapApiResult<PyrlEmployeeAssignmentResponseDto | null>(
    await apiClient.GET("/api/v1/payroll/employee-assignments/active", { params: { query: { employeeId, date } } }),
  );
}

export async function assignEmployee(dto: AssignEmployeeDto): Promise<PyrlEmployeeAssignmentResponseDto> {
  return unwrapApiResult<PyrlEmployeeAssignmentResponseDto>(await apiClient.POST("/api/v1/payroll/employee-assignments", { body: dto }));
}

/** Closes the employee's currently open-ended assignment (`effectiveTo IS NULL`) — real `404` if none is open, confirmed by reading `endAssignment()` directly (`NotFoundException` on an empty find). */
export async function endEmployeeAssignment(employeeId: string, dto: EndAssignmentDto): Promise<PyrlEmployeeAssignmentResponseDto> {
  return unwrapApiResult<PyrlEmployeeAssignmentResponseDto>(
    await apiClient.POST("/api/v1/payroll/employee-assignments/end", { params: { query: { employeeId } }, body: dto }),
  );
}
