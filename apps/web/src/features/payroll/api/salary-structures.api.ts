import type {
  CreatePyrlSalaryStructureDto,
  PyrlSalaryStructureResponseDto,
  StructureComponentLineDto,
  StructureComponentLineResponseDto,
  UpdatePyrlSalaryStructureDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * **A real, live-confirmed backend bug, out of this part's own
 * pre-authorized backend-touch scope (the `create()` 409 fix only) — left
 * unfixed, honestly flagged**: `addLine()`/`updateLine()` on the real
 * controller ALWAYS route a line's data through `formula` (even for
 * `type: "FIXED"`), never through the dedicated `amount` column the service
 * layer genuinely supports (proven correct in isolation by
 * `salary-structures.service.spec.ts`'s own unit test). Practically: every
 * `StructureComponentLineResponseDto.amount` this file's functions return is
 * permanently `null`, and a FIXED line's real KES amount lives at
 * `formula.amount` instead. See `structure-line-editor.tsx`'s own doc
 * comment for the full analysis (including why Pass B's future payroll
 * computation is unaffected) and `resolveLineDisplay()`, the helper that
 * reads this correctly.
 *
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — thin wrapper over
 * `SalaryStructuresController`
 * (`packages/server/src/domains/payroll/api/salary-structures.controller.ts`,
 * base `/api/v1/payroll/salary-structures`, tag `payroll-salary-structures`)
 * — a SINGLE shared `payroll:structure:manage` permission gates ALL 8
 * routes, including both LIST routes (confirmed by reading the controller
 * directly, 119 lines — same "no separate `:view` code" shape
 * `components.api.ts` already established for Part 1). **No DELETE route
 * exists for the structure header itself** — only for lines
 * (`removeLine()` below) — confirmed by reading the controller directly.
 *
 * **Zero request-body codegen gaps here — a real, different finding from
 * Part 1's own Components/Employees DTOs, checked directly rather than
 * assumed.** `CreatePyrlSalaryStructureDtoSchema`/
 * `UpdatePyrlSalaryStructureDtoSchema`/`StructureComponentLineDtoSchema`
 * (`@klickit/contracts`' zod-inferred types) all generate cleanly — unlike
 * `CreatePyrlComponentDto.kind`/`CreatePyrlEmployeeDto.employmentType`
 * (Part 1's own finding), `StructureComponentLineDto.type` DOES reflect as
 * a real literal union on the zod side too
 * (`z.enum(["FIXED", "PERCENT_OF_BASIC"])`), because it's validated via
 * `@IsIn([...])` rather than `@IsString()` — the zod-codegen script mirrors
 * `@IsIn()`'s own literal array, unlike `@IsString()` which loses any union
 * entirely. Every one of `createSalaryStructure()`/`updateSalaryStructure()`/
 * `addStructureLine()`/`updateStructureLine()` below passes its `dto`
 * straight through with no `as unknown as` cast, confirmed by a clean `tsc
 * --noEmit`, matching `budgets.api.ts`'s own "generates cleanly" precedent
 * rather than `components.api.ts`'s cast-at-the-boundary one.
 *
 * **One response-side gap exists, already covered for free**:
 * `PyrlSalaryStructureResponseDto.grade` degrades to
 * `Record<string, never> | null` in the RAW generated `openapi-types.ts`
 * (`grade!: string | null` on the class has no explicit `type:` hint for
 * `@nestjs/swagger`'s reflection to pick up — the same nullable-without-a-
 * primitive-type-hint gap `lib/api-error.ts`'s own doc comment documents).
 * The zod-inferred `PyrlSalaryStructureResponseDto` (used directly below as
 * every read function's return type, per `employees.api.ts`'s own
 * precedent) gets this right (`grade: z.string().nullable()`), and
 * `unwrapApiResult<T>()`'s `data: unknown` parameter absorbs the raw-type
 * mismatch for free — no local-interface-plus-cast needed.
 *
 * **`removeLine()`'s generated response has no typed content at all**
 * (`content?: never` — the controller's own `@ApiResponse({ status: 200 })`
 * carries no `type:`), but the real handler returns `{ removed: boolean }`
 * (confirmed by reading `SalaryStructuresController.removeLine()` directly)
 * — `removeStructureLine()` below types its return as that real shape
 * rather than `void`, the same "ask for the real wire shape since
 * `unwrapApiResult` doesn't care either way" choice `budgets.api.ts`'s own
 * `deleteBudgetLine()` already makes for the identical gap shape.
 *
 * **`updateLine()`'s request body still requires a full `componentId`+`type`
 * even though `componentId` is accepted but ignored server-side** —
 * confirmed by reading `SalaryStructuresController.updateLine()` /
 * `SalaryStructuresService.updateLine()` directly: only `formula` (derived
 * from `type`+`amount`/`rate`) is ever applied to the row. `updateStructureLine()`
 * below still takes the full `StructureComponentLineDto` shape (the
 * server-side DTO's own shape, not narrowed) — callers (`structure-line-editor.tsx`)
 * resubmit the line's own existing `componentId` verbatim rather than
 * inventing a narrower request type for a field the server silently drops.
 */
export async function listSalaryStructures(): Promise<PyrlSalaryStructureResponseDto[]> {
  return unwrapApiResult<PyrlSalaryStructureResponseDto[]>(await apiClient.GET("/api/v1/payroll/salary-structures"));
}

export async function getSalaryStructure(id: string): Promise<PyrlSalaryStructureResponseDto> {
  return unwrapApiResult<PyrlSalaryStructureResponseDto>(
    await apiClient.GET("/api/v1/payroll/salary-structures/{id}", { params: { path: { id } } }),
  );
}

/** `effectiveFrom` is purely descriptive metadata here — see `create-salary-structure-dialog.tsx`'s own doc comment for why it plays no role in any real time-versioned lookup. Duplicate `name` now returns a real `409` (this part's own opportunistic backend fix, `salary-structures.service.ts`'s `create()`) rather than a raw `500` — surfaced verbatim via `ApiError.message`. */
export async function createSalaryStructure(dto: CreatePyrlSalaryStructureDto): Promise<PyrlSalaryStructureResponseDto> {
  return unwrapApiResult<PyrlSalaryStructureResponseDto>(await apiClient.POST("/api/v1/payroll/salary-structures", { body: dto }));
}

/** `name`/`grade`/`effectiveFrom` are ALL editable — unlike Components/Employees, nothing on this DTO is create-only/immutable (confirmed by reading `UpdatePyrlSalaryStructureDto` directly). */
export async function updateSalaryStructure(id: string, dto: UpdatePyrlSalaryStructureDto): Promise<PyrlSalaryStructureResponseDto> {
  return unwrapApiResult<PyrlSalaryStructureResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/salary-structures/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function listStructureLines(structureId: string): Promise<StructureComponentLineResponseDto[]> {
  return unwrapApiResult<StructureComponentLineResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/salary-structures/{id}/lines", { params: { path: { id: structureId } } }),
  );
}

/** Exactly one of `amount`/`rate` per `type` — server-enforced (`@ValidateIf` + `ck_pyrl_structure_component_amount_or_formula`), and mirrored client-side by `structure-line-editor.tsx`'s own FIXED/PERCENT_OF_BASIC toggle. */
export async function addStructureLine(structureId: string, dto: StructureComponentLineDto): Promise<StructureComponentLineResponseDto> {
  return unwrapApiResult<StructureComponentLineResponseDto>(
    await apiClient.POST("/api/v1/payroll/salary-structures/{id}/lines", { params: { path: { id: structureId } }, body: dto }),
  );
}

/** Hangs directly off `salary-structures/lines/{lineId}` — NOT nested under a structure id (confirmed by reading the controller directly, `salary-structures.controller.ts:94`). See this file's own doc comment on `componentId` being accepted-but-ignored server-side. */
export async function updateStructureLine(lineId: string, dto: StructureComponentLineDto): Promise<StructureComponentLineResponseDto> {
  return unwrapApiResult<StructureComponentLineResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/salary-structures/lines/{lineId}", { params: { path: { lineId } }, body: dto }),
  );
}

export async function removeStructureLine(lineId: string): Promise<{ removed: boolean }> {
  return unwrapApiResult<{ removed: boolean }>(
    await apiClient.DELETE("/api/v1/payroll/salary-structures/lines/{lineId}", { params: { path: { lineId } } }),
  );
}
