import type { CreatePyrlEmployeeDto, ExitPyrlEmployeeDto, PyrlEmployeeResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — thin wrapper
 * over `EmployeesController`
 * (`packages/server/src/domains/payroll/api/employees.controller.ts`, base
 * `/api/v1/payroll/employees`, tag `payroll-employees`) — reads are gated by
 * `payroll:employee:view`, mutations by the narrower `payroll:employee:manage`
 * (confirmed by reading the controller directly), EXCEPT `/decrypted`, which
 * needs `payroll:employee:manage` too (not `:view` — a stricter permission
 * than the plain detail read, FR-PYRL-012.1's own access-control split).
 *
 * **UPDATE (migration `0240`) — the gap below is now fixed.** `nationalId`/
 * `kraPin` used to be NEVER redacted or encrypted anywhere on this
 * controller, contradicting Part 1's own task brief, which claimed both
 * were "ENCRYPTED at rest" — a real, live-verified finding at the time
 * (`pyrl-employee.entity.ts` typed both as plain `varchar`, not the `jsonb`
 * "(enc)" shape `payDetails`/`bankName`/`branch`/`account` genuinely used,
 * and `EmployeesService.redact()` never touched either). `nationalId`/
 * `kraPin` are now encrypted at rest and redacted (`"***"`) on every read
 * except `/decrypted`, the exact same way the other 4 fields already work —
 * confirmed by reading `pyrl-employee.entity.ts`/`employees.service.ts`
 * directly, not assumed. This file's response type never needed to change
 * (`nationalId`/`kraPin` were always `string`-typed here, same before and
 * after — only the VALUE they hold on a redacted read changed, from real
 * plaintext to `"***"`), so no type-level edit was needed in this file for
 * the fix itself.
 *
 * **The zod-inferred `PyrlEmployeeResponseDto` (`@klickit/contracts`) is the
 * CORRECT wire shape and is used directly as this file's read-return type —
 * checked directly against `employee.schema.ts`, not assumed**: `userId`/
 * `nssfNo`/`shifNo`/`exitDate` are real `string | null`, and `payDetails`/
 * `bankName`/`branch`/`account` are `unknown | null` (accepting both the
 * redacted `"***"` string `EmployeesService.redact()` actually returns AND
 * the real plaintext `/decrypted` returns). The RAW generated
 * `openapi-types.ts` shape is the one with real gaps on this response DTO —
 * `userId`/`nssfNo`/`shifNo`/`exitDate` all degrade to `Record<string,
 * never> | null` (the class carries `@ApiProperty({ nullable: true })`
 * without an explicit `type:`, defeating reflection, the same
 * `lib/api-error.ts`-documented class of gap), and `payDetails`/`bankName`/
 * `branch`/`account` type as `{[key: string]: unknown} | null` — which
 * doesn't even accept the real `"***"` string value every non-`/decrypted`
 * read actually returns. `unwrapApiResult<T>()` doesn't validate against the
 * raw type at runtime, so supplying the zod type as `<T>` directly (no cast)
 * is both simpler and more accurate than mirroring the gapped raw shape here
 * — this file never imports the raw `components["schemas"][...]` types at
 * all.
 *
 * **Request-body gap — genuinely different from every prior part's own
 * story**: `payDetails`/`bankName`/`branch`/`account` are typed `unknown` on
 * BOTH `CreatePyrlEmployeeDto`/`UpdatePyrlEmployeeDto`'s own class fields
 * (`employee.dto.ts`) with only `@IsOptional()` — no shape validation
 * whatsoever, confirmed directly. This part's own task brief directs
 * treating all 4 as plain free-text string inputs (no backend-defined
 * structure exists to match). The RAW generated request-body type narrows
 * them to `{[key: string]: unknown} | null` (from
 * `@ApiPropertyOptional({ type: "object", additionalProperties: true,
 * nullable: true })` on the class), which does NOT structurally accept a
 * plain string — so every create/update call below casts the 4 opaque
 * fields at the `apiClient` boundary via `EmployeeOpaqueFields`, the same
 * "cast at the one boundary that hits a real gap" discipline every sibling
 * `*.api.ts` file in this codebase already establishes, just for a
 * "the frontend picked its own shape" reason instead of the usual
 * "reflection lost the union" reason.
 *
 * **`nssfNo`/`shifNo`/`userId` on `UpdatePyrlEmployeeDto`** generate as
 * `Record<string, never> | null` in the raw type too (same reflection gap as
 * the response DTO above, `nssfNo?: string | null` on the class with no
 * explicit `type:`) — folded into the same boundary cast below rather than a
 * second interface, since every field needing a cast on the update path is
 * already covered by one combined `UpdatePyrlEmployeeRequestBody`.
 *
 * **No clean 409 on duplicate `staffNo`** — confirmed by reading
 * `PyrlEmployeeRepository.create()`/`EmployeesService.create()` directly:
 * unlike `ComponentsService.create()` (this same part's own opportunistic
 * fix target), nothing here catches the `23505` unique-violation on
 * `uq_pyrl_employee_staff_no` — a raw `500` reaches the caller. Documented,
 * NOT fixed (Employees is not one of the 3 opportunistic-409-fix candidates
 * per this part's own plan) — `create-employee-dialog.tsx` shows a generic
 * "this staff number may already be in use" message on any caught 500 from
 * this specific call, rather than a misleading generic error.
 */
/**
 * Mirrors the GENERATED (object-shaped) request-body type for the 4 opaque
 * encrypted fields — `Record<string, unknown> | null`, per
 * `@ApiPropertyOptional({ type: "object", additionalProperties: true,
 * nullable: true })` on the class. Used ONLY as a cast target (this file
 * never literally constructs a value of this shape — the real runtime
 * payload is a plain string, see this file's own doc comment above); the
 * cast happens via `dto as unknown as ...`, which bypasses the structural
 * mismatch entirely, matching every other real codegen-gap cast in this
 * codebase.
 */
interface EmployeeOpaqueFieldsRaw {
  payDetails?: Record<string, unknown> | null;
  bankName?: Record<string, unknown> | null;
  branch?: Record<string, unknown> | null;
  account?: Record<string, unknown> | null;
}

/**
 * **A SECOND, genuinely different codegen gap — the zod-inferred DTO is the
 * one with the problem here, not the raw generated type**: `employee.schema.ts`'s
 * own `CreatePyrlEmployeeDtoSchema.employmentType`/`UpdatePyrlEmployeeDtoSchema.employmentType`
 * are both plain `z.string()`, NOT `z.enum(PYRL_EMPLOYMENT_TYPES)` — the
 * zod-codegen script mirrors `@IsString()` (all `employee.dto.ts`'s own
 * `employmentType` field carries, since `PyrlEmploymentType` is a plain TS
 * union, not a runtime enum class-validator can reflect via `@IsEnum()`) as
 * generic `z.string()`, losing the union entirely. The RAW generated
 * `openapi-types.ts` gets this one RIGHT (`employmentType: "PERMANENT" |
 * "CONTRACT" | "CASUAL" | "PART_TIME"`, from `@ApiProperty({ enum:
 * PYRL_EMPLOYMENT_TYPES })`/`@ApiPropertyOptional({ enum: ... })`, which
 * `@nestjs/swagger`'s reflection DOES pick up) — the opposite direction from
 * every other gap in this file, and the same "zod-inferred type has the
 * OPPOSITE problem" shape `statement-import.api.ts`'s own doc comment
 * documents for `mappingTemplate` (Slice 21 Part 3). Folded into the same
 * boundary-cast interfaces below rather than a third, separate one.
 */
type PyrlEmploymentTypeLiteral = "PERMANENT" | "CONTRACT" | "CASUAL" | "PART_TIME";

interface CreatePyrlEmployeeRequestBody extends EmployeeOpaqueFieldsRaw {
  staffNo: string;
  userId?: string | null;
  fullName: string;
  nationalId: string;
  kraPin: string;
  nssfNo?: string | null;
  shifNo?: string | null;
  employmentType: PyrlEmploymentTypeLiteral;
  departmentId: string;
  jobTitle: string;
  hireDate: string;
  costCenterId: string;
}

/** `nssfNo`/`shifNo`/`userId` mirror the GENERATED (gapped) shape here specifically — `Record<string, never> | null`, not `string | null` (unlike the CREATE dto's own clean `string | null` for the same 3 fields) — see this file's own doc comment above. */
interface UpdatePyrlEmployeeRequestBody extends EmployeeOpaqueFieldsRaw {
  fullName?: string;
  jobTitle?: string;
  departmentId?: string;
  costCenterId?: string;
  employmentType?: PyrlEmploymentTypeLiteral;
  nssfNo?: Record<string, never> | null;
  shifNo?: Record<string, never> | null;
  userId?: Record<string, never> | null;
}

interface EmployeesListQueryShape {
  isActive?: string;
  departmentId?: string;
}

export interface ListPyrlEmployeesParams {
  isActive?: boolean;
  departmentId?: string;
}

/**
 * The frontend's OWN shape for the create form's 4 opaque encrypted fields —
 * plain free-text strings, per this part's own task brief (no backend-defined
 * structure exists for `payDetails`/`bankName`/`branch`/`account`). `undefined`
 * omits the field entirely (leaves it `NULL` server-side, per
 * `EmployeesService.create()`'s own `encodeField()`).
 */
export interface CreateEmployeeInput {
  staffNo: string;
  userId?: string | null;
  fullName: string;
  nationalId: string;
  kraPin: string;
  nssfNo?: string;
  shifNo?: string;
  employmentType: PyrlEmploymentTypeLiteral;
  departmentId: string;
  jobTitle: string;
  hireDate: string;
  costCenterId: string;
  payDetails?: string;
  bankName?: string;
  branch?: string;
  account?: string;
}

/** Only the fields `UpdatePyrlEmployeeDto` actually accepts — see this file's own doc comment. `staffNo`/`nationalId`/`kraPin`/`hireDate` are create-only/immutable and never appear here at all. */
export interface UpdateEmployeeInput {
  fullName?: string;
  jobTitle?: string;
  departmentId?: string;
  costCenterId?: string;
  employmentType?: PyrlEmploymentTypeLiteral;
  nssfNo?: string | null;
  shifNo?: string | null;
  userId?: string | null;
  payDetails?: string | null;
  bankName?: string | null;
  branch?: string | null;
  account?: string | null;
}

export async function listEmployees(params: ListPyrlEmployeesParams = {}): Promise<PyrlEmployeeResponseDto[]> {
  const query: EmployeesListQueryShape = {};
  if (params.isActive !== undefined) query.isActive = String(params.isActive);
  if (params.departmentId !== undefined) query.departmentId = params.departmentId;
  return unwrapApiResult<PyrlEmployeeResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/employees", { params: { query: query as unknown as Required<EmployeesListQueryShape> } }),
  );
}

/** Trigram name search (`GET .../search`, hardcoded server-side `limit=20`) — the intended list-page search mechanism, not a client-side filter over `listEmployees()`. */
export async function searchEmployees(q: string): Promise<PyrlEmployeeResponseDto[]> {
  return unwrapApiResult<PyrlEmployeeResponseDto[]>(await apiClient.GET("/api/v1/payroll/employees/search", { params: { query: { q } } }));
}

export async function getEmployee(id: string): Promise<PyrlEmployeeResponseDto> {
  return unwrapApiResult<PyrlEmployeeResponseDto>(await apiClient.GET("/api/v1/payroll/employees/{id}", { params: { path: { id } } }));
}

/** `payroll:employee:manage`-gated — real plaintext `payDetails`/`bankName`/`branch`/`account`. Never called except on explicit user action, see `employee-bank-details-panel.tsx`. */
export async function getEmployeeDecrypted(id: string): Promise<PyrlEmployeeResponseDto> {
  return unwrapApiResult<PyrlEmployeeResponseDto>(await apiClient.GET("/api/v1/payroll/employees/{id}/decrypted", { params: { path: { id } } }));
}

export async function createEmployee(input: CreateEmployeeInput): Promise<PyrlEmployeeResponseDto> {
  const dto: CreatePyrlEmployeeDto = {
    staffNo: input.staffNo,
    userId: input.userId ?? undefined,
    fullName: input.fullName,
    nationalId: input.nationalId,
    kraPin: input.kraPin,
    nssfNo: input.nssfNo,
    shifNo: input.shifNo,
    employmentType: input.employmentType,
    departmentId: input.departmentId,
    jobTitle: input.jobTitle,
    hireDate: input.hireDate,
    costCenterId: input.costCenterId,
    payDetails: input.payDetails,
    bankName: input.bankName,
    branch: input.branch,
    account: input.account,
  };
  return unwrapApiResult<PyrlEmployeeResponseDto>(
    await apiClient.POST("/api/v1/payroll/employees", { body: dto as unknown as CreatePyrlEmployeeRequestBody }),
  );
}

export async function updateEmployee(id: string, dto: UpdateEmployeeInput): Promise<PyrlEmployeeResponseDto> {
  return unwrapApiResult<PyrlEmployeeResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/employees/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdatePyrlEmployeeRequestBody,
    }),
  );
}

/** BR-PYRL-04 — `isActive=false`, `exitDate` set. */
export async function exitEmployee(id: string, exitDate: string): Promise<PyrlEmployeeResponseDto> {
  const dto: ExitPyrlEmployeeDto = { exitDate };
  return unwrapApiResult<PyrlEmployeeResponseDto>(
    await apiClient.POST("/api/v1/payroll/employees/{id}/exit", { params: { path: { id } }, body: dto }),
  );
}
