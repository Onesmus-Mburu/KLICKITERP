import type { CreatePyrlComponentDto, PyrlComponentResponseDto, UpdatePyrlComponentDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — thin wrapper
 * over `ComponentsController`
 * (`packages/server/src/domains/payroll/api/components.controller.ts`, base
 * `/api/v1/payroll/components`, tag `payroll-components`) — a SINGLE shared
 * `payroll:component:manage` permission gates ALL 4 routes, including LIST
 * (confirmed by reading the controller directly, 67 lines — no separate
 * `:view` code exists, and no DELETE route exists anywhere on this
 * controller).
 *
 * **No `Record<string, never>` reflection-gap anywhere on this DTO family**
 * (checked directly against `openapi-types.ts`) — `code`/`name`/`isTaxable`/
 * `isStatutory`/`glAccountId` all generate as plain, correctly-optional
 * primitives on both `CreatePyrlComponentDto`/`UpdatePyrlComponentDto`.
 * `UpdatePyrlComponentDto` (no `kind` field at all — immutable, see below)
 * passes straight through with no cast, matching `accounts.api.ts`'s own
 * "generates cleanly" precedent.
 *
 * **`CreatePyrlComponentDto.kind` is a real, different-shaped gap — the
 * zod-inferred DTO has the problem, not the raw generated type**:
 * `component.schema.ts`'s own `CreatePyrlComponentDtoSchema.kind` is plain
 * `z.string()`, NOT `z.enum(PYRL_COMPONENT_KINDS)` (the zod-codegen script
 * mirrors `@IsString()`, which is all `component.dto.ts`'s `kind` field
 * carries, since `PyrlComponentKind` is a plain TS union, not a runtime enum
 * `@IsEnum()` could reflect) — losing the union entirely. The RAW generated
 * `openapi-types.ts` gets this one RIGHT (`kind: "EARNING" | "DEDUCTION"`,
 * from `@ApiProperty({ enum: PYRL_COMPONENT_KINDS })`, which
 * `@nestjs/swagger`'s reflection DOES pick up) — the same "zod-inferred type
 * has the OPPOSITE problem" shape `employees.api.ts`'s own doc comment
 * documents for `employmentType` right next to this file. `createComponent()`
 * below casts at the boundary via `CreatePyrlComponentRequestBody`.
 *
 * **BR — duplicate `code` now gets a real 409, this part's own opportunistic
 * backend fix**: `ComponentsService.create()` (`packages/server/.../
 * application/components.service.ts`) previously let a `23505` unique-
 * violation on `uq_pyrl_component_code` reach the caller as a raw `500`; this
 * part adds the same `isUniqueViolation()`-catch-and-translate-to-
 * `ConflictException` pattern `BankAccountsService`/`EmployeeAssignmentsService`
 * already establish elsewhere in this codebase, live-reverified after a
 * rebuild+restart (see `docs/phase-6/PROGRESS.md`'s own Slice 22 Part 1
 * write-up for the real curl round trip). `createComponent()` below surfaces
 * that `409` verbatim via `ApiError.message`, same as every other real
 * uniqueness constraint in this app.
 */
interface ComponentsListQueryShape {
  kind?: string;
  isStatutory?: string;
}

/**
 * Mirrors `CreatePyrlComponentDto`'s GENERATED shape exactly — `kind` as the
 * real literal union (see this file's own doc comment above), AND
 * `isStatutory` as REQUIRED (`boolean`, no `?`) — a second, smaller gap:
 * `component.dto.ts`'s own class field is `@ApiPropertyOptional({ default:
 * false })`, and `openapi-typescript` treats a Swagger `default` as making
 * the generated property non-optional (the value is "always present after
 * defaulting"), even though the class-validator side (`@IsOptional()`)
 * genuinely allows omitting it. `createComponent()` below always supplies a
 * real boolean from the form's own `isStatutory` state (never `undefined`),
 * so this is a type-level-only accommodation, not a behavior change.
 */
interface CreatePyrlComponentRequestBody {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  isTaxable: boolean;
  isStatutory: boolean;
  glAccountId: string;
}

export interface ListPyrlComponentsParams {
  kind?: string;
  isStatutory?: boolean;
}

export async function listComponents(params: ListPyrlComponentsParams = {}): Promise<PyrlComponentResponseDto[]> {
  const query: ComponentsListQueryShape = {};
  if (params.kind !== undefined) query.kind = params.kind;
  if (params.isStatutory !== undefined) query.isStatutory = String(params.isStatutory);
  return unwrapApiResult<PyrlComponentResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/components", { params: { query: query as unknown as Required<ComponentsListQueryShape> } }),
  );
}

export async function getComponent(id: string): Promise<PyrlComponentResponseDto> {
  return unwrapApiResult<PyrlComponentResponseDto>(await apiClient.GET("/api/v1/payroll/components/{id}", { params: { path: { id } } }));
}

export async function createComponent(dto: CreatePyrlComponentDto): Promise<PyrlComponentResponseDto> {
  return unwrapApiResult<PyrlComponentResponseDto>(
    await apiClient.POST("/api/v1/payroll/components", { body: dto as unknown as CreatePyrlComponentRequestBody }),
  );
}

/** `code`/`kind` are not accepted here at all — immutable after creation, see `edit-component-dialog.tsx`'s own doc comment. */
export async function updateComponent(id: string, dto: UpdatePyrlComponentDto): Promise<PyrlComponentResponseDto> {
  return unwrapApiResult<PyrlComponentResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/components/{id}", { params: { path: { id } }, body: dto }),
  );
}
