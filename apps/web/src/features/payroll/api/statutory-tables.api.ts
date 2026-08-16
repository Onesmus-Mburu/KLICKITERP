import type { CreatePyrlStatutoryTableDto, PyrlStatutoryTableResponseDto, UpdatePyrlStatutoryTableDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { PyrlStatutoryKind } from "../lib/statutory-params";

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — thin wrapper over
 * `StatutoryTablesController`
 * (`packages/server/src/domains/payroll/api/statutory-tables.controller.ts`,
 * base `/api/v1/payroll/statutory-tables`, tag `payroll-statutory-tables`) —
 * a SINGLE shared `payroll:statutory-table:manage` permission gates ALL 5
 * routes, including both LIST-shaped routes (`listByKind`/`findEffectiveFor`),
 * confirmed by reading the controller directly, 71 lines — same "no separate
 * `:view` code" shape every prior Payroll part's own controller already
 * establishes. **No DELETE route exists anywhere on this controller**
 * (confirmed directly).
 *
 * **`kind` is a REQUIRED query param on `GET /payroll/statutory-tables`**
 * (`listByKind(@Query("kind") kind: PyrlStatutoryKind)`, no default/optional
 * — confirmed by reading the controller directly) — there is no "list every
 * kind" call; `listStatutoryTables()` below reflects that by taking `kind`
 * as a required parameter, not an optional filter.
 *
 * **`GET .../effective` is registered BEFORE `GET .../:id`** on the real
 * controller specifically so NestJS doesn't try to match the literal string
 * `"effective"` as an `:id` (a route-ordering concern the controller's own
 * inline comment documents) — this file's own function ordering mirrors
 * that for readability, though it makes no difference to the frontend
 * (each function targets its own distinct URL, `apiClient` doesn't care
 * about declaration order).
 *
 * **Request-body codegen check (per this part's own task brief) — one real
 * gap found, the SAME shape Part 1's own `kind`/`employmentType` finding
 * documents, not a new class**: the RAW generated `openapi-types.ts` gets
 * `CreatePyrlStatutoryTableDto.kind` right as a real literal union
 * (`"PAYE" | "NSSF" | "SHIF" | "AHL"`, from `@ApiProperty({ enum:
 * PYRL_STATUTORY_KINDS })`, which `@nestjs/swagger`'s reflection DOES pick
 * up), but the zod-inferred `CreatePyrlStatutoryTableDtoSchema.kind` (what
 * `@klickit/contracts` actually exports, and what `createStatutoryTable()`
 * below is typed against) is plain `z.string()` — the zod-codegen script
 * mirrors `@IsString()` (all `statutory-table.dto.ts`'s `kind` field
 * carries; `PyrlStatutoryKind` is a plain TS union, not a runtime enum
 * `@IsEnum()` could reflect), losing the literal union entirely at the zod
 * level. This causes NO real problem here — a caller's own local
 * `PyrlStatutoryKind`-typed `kind` value is a subtype of `string` and
 * assigns straight into the wider zod-inferred field with no cast needed —
 * but is flagged for the record since Part 2's own salary-structures DTOs
 * found the opposite (zero gaps at all). `params: Record<string, unknown>`
 * genuinely DOES generate cleanly and identically on both the raw and
 * zod-inferred types (checked directly, per this part's own task brief
 * instruction to verify rather than assume) — `@IsObject()` with no nested
 * shape reflects as a plain open object either way.
 *
 * **This gap DOES bite at the `apiClient.POST()` call site** —
 * `apiClient` (openapi-fetch) is generated straight off the RAW
 * `openapi-types.ts` shape, so it wants the real literal union for `kind`,
 * while `createStatutoryTable()` below is typed against the WIDER
 * zod-inferred `CreatePyrlStatutoryTableDto` (`kind: string`) per this
 * feature's own established "zod-inferred type as the public function
 * signature" convention. `createStatutoryTable()` casts at the boundary via
 * `CreatePyrlStatutoryTableRequestBody`, the same shape
 * `components.api.ts`'s own `createComponent()` already establishes for the
 * identical class of gap.
 */
interface CreatePyrlStatutoryTableRequestBody {
  kind: PyrlStatutoryKind;
  effectiveFrom: string;
  params: Record<string, unknown>;
  sourceNote: string;
}

export async function listStatutoryTables(kind: PyrlStatutoryKind): Promise<PyrlStatutoryTableResponseDto[]> {
  return unwrapApiResult<PyrlStatutoryTableResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/statutory-tables", { params: { query: { kind } } }),
  );
}

export async function getStatutoryTable(id: string): Promise<PyrlStatutoryTableResponseDto> {
  return unwrapApiResult<PyrlStatutoryTableResponseDto>(
    await apiClient.GET("/api/v1/payroll/statutory-tables/{id}", { params: { path: { id } } }),
  );
}

/**
 * BR-PYRL-01's exact lookup: the rate table effective on or before
 * `periodEndDate`, for `kind`. Throws a real `ApiError` with `status: 404`
 * (surfaced via `unwrapApiResult`) when no such row exists — callers
 * (`useEffectiveStatutoryTable()`) treat that 404 as a legitimate, expected
 * "no table configured for this date" outcome to render inline, not a
 * generic error state.
 */
export async function getEffectiveStatutoryTable(kind: PyrlStatutoryKind, periodEndDate: string): Promise<PyrlStatutoryTableResponseDto> {
  return unwrapApiResult<PyrlStatutoryTableResponseDto>(
    await apiClient.GET("/api/v1/payroll/statutory-tables/effective", { params: { query: { kind, periodEndDate } } }),
  );
}

/**
 * `kind`/`effectiveFrom` are create-only/immutable — confirmed by reading
 * `UpdatePyrlStatutoryTableDto` directly (`params?`/`sourceNote?` only).
 * Duplicate `(kind, effectiveFrom)` now returns a real `409` (this part's
 * own opportunistic backend fix, `StatutoryTablesService.create()`) rather
 * than a raw `500` — surfaced verbatim via `ApiError.message`.
 */
export async function createStatutoryTable(dto: CreatePyrlStatutoryTableDto): Promise<PyrlStatutoryTableResponseDto> {
  return unwrapApiResult<PyrlStatutoryTableResponseDto>(
    await apiClient.POST("/api/v1/payroll/statutory-tables", { body: dto as unknown as CreatePyrlStatutoryTableRequestBody }),
  );
}

/** Only `params`/`sourceNote` are accepted here — `kind`/`effectiveFrom` are not on this DTO at all, see this file's own doc comment. */
export async function updateStatutoryTable(id: string, dto: UpdatePyrlStatutoryTableDto): Promise<PyrlStatutoryTableResponseDto> {
  return unwrapApiResult<PyrlStatutoryTableResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/statutory-tables/{id}", { params: { path: { id } }, body: dto }),
  );
}
