import type { CreateFiscalYearDto, FiscalYearResponseDto, PeriodResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — thin
 * wrapper over `FiscalYearsController`
 * (`packages/server/src/accounting/api/fiscal-years.controller.ts`, base
 * `/api/v1/accounting`, no shared sub-prefix — fiscal-year and period
 * routes both hang directly off `accounting/...`). `accounting:fiscal-year:view`
 * gates list/get/list-periods, `accounting:fiscal-year:manage` gates create,
 * `accounting:period:manage` gates the 3 transition endpoints (confirmed by
 * reading the controller directly, 79 lines). Unlike `accounts.api.ts`, NONE
 * of this controller's routes have a query-param-typed-as-required-string
 * gap (every route here is either bodyless or takes only a path `id`,
 * confirmed against `packages/contracts/src/generated/openapi-types.ts`
 * directly), and `FiscalYearResponseDto`/`PeriodResponseDto` have no
 * nullable-field gap either (no field on either is nullable).
 *
 * A THIRD, previously-undocumented codegen gap found while writing this file
 * (distinct from the two the plan flagged for `accounts.api.ts`):
 * `CreateFiscalYearDto.periodCount` is genuinely optional server-side
 * (`create-fiscal-year.dto.ts`: `@ApiPropertyOptional({ default: 12, ... })
 * @IsOptional() periodCount?: number`), but the generated request-body type
 * drops the `?` entirely (`periodCount: number;`, required, no default
 * baked in either) — `openapi-typescript` apparently treats a Swagger
 * `default` on an `ApiPropertyOptional` field as "always present," not
 * "optional with a server-side fallback." Fixed the same targeted-local-
 * interface way as every other gap in this slice: `CreateFiscalYearRequestBody`
 * below matches the REAL (optional) shape, cast at the one call boundary
 * that needs it.
 *
 * No "close year" endpoint exists anywhere on this controller (confirmed by
 * reading it) — a fiscal year becomes `LOCKED` only derivatively, once every
 * one of its periods is individually hard-closed server-side
 * (`FiscalYearsService`'s own doc comment). This file therefore has no
 * `closeFiscalYear()`-shaped function to wrap; the fiscal-year list simply
 * reflects `status` as computed server-side.
 */
/**
 * Mirrors `CreateFiscalYearDto`'s GENERATED (gapped) shape: `periodCount`
 * REQUIRED (matching the buggy generated type), even though the real
 * `CreateFiscalYearDto.periodCount` is optional — the local interface used
 * at a cast boundary must match what the destination function parameter
 * expects, not the "real" shape, or the interface itself becomes
 * incompatible at the call site (see `accounts.api.ts`'s own doc comment
 * for the full reasoning, confirmed the hard way via a real `tsc --noEmit`
 * failure caught and fixed while writing this file).
 */
interface CreateFiscalYearRequestBody {
  name: string;
  startsOn: string;
  endsOn: string;
  periodCount: number;
}

export async function listFiscalYears(): Promise<FiscalYearResponseDto[]> {
  return unwrapApiResult<FiscalYearResponseDto[]>(await apiClient.GET("/api/v1/accounting/fiscal-years"));
}

export async function getFiscalYear(id: string): Promise<FiscalYearResponseDto> {
  return unwrapApiResult<FiscalYearResponseDto>(
    await apiClient.GET("/api/v1/accounting/fiscal-years/{id}", { params: { path: { id } } }),
  );
}

/** Auto-generates `periodCount` (default 12) OPEN periods spanning `[startsOn, endsOn]` in the same server-side transaction — equal-length-as-possible calendar-DAY slices, NOT real calendar months. */
export async function createFiscalYear(dto: CreateFiscalYearDto): Promise<FiscalYearResponseDto> {
  return unwrapApiResult<FiscalYearResponseDto>(
    await apiClient.POST("/api/v1/accounting/fiscal-years", { body: dto as unknown as CreateFiscalYearRequestBody }),
  );
}

/** Ascending by `seq` — server-guaranteed order, confirmed by the controller's own `@ApiOperation` summary. */
export async function listPeriodsForFiscalYear(fiscalYearId: string): Promise<PeriodResponseDto[]> {
  return unwrapApiResult<PeriodResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/fiscal-years/{id}/periods", { params: { path: { id: fiscalYearId } } }),
  );
}

export async function getPeriod(id: string): Promise<PeriodResponseDto> {
  return unwrapApiResult<PeriodResponseDto>(await apiClient.GET("/api/v1/accounting/periods/{id}", { params: { path: { id } } }));
}

/** Legal from OPEN or SOFT_CLOSED — rejected with a real 422 ("hard close is final") if the period is currently HARD_CLOSED. */
export async function openPeriod(id: string): Promise<PeriodResponseDto> {
  return unwrapApiResult<PeriodResponseDto>(await apiClient.POST("/api/v1/accounting/periods/{id}/open", { params: { path: { id } } }));
}

/** Legal unless the period is currently HARD_CLOSED. */
export async function softClosePeriod(id: string): Promise<PeriodResponseDto> {
  return unwrapApiResult<PeriodResponseDto>(
    await apiClient.POST("/api/v1/accounting/periods/{id}/soft-close", { params: { path: { id } } }),
  );
}

/** Only legal when the period is ALREADY SOFT_CLOSED (cannot jump OPEN -> HARD_CLOSED directly, enforced server-side) — rejected with a real 422 otherwise. Callers should disable this action client-side until `status === "SOFT_CLOSED"`, but must still handle the 422 gracefully for a race/direct-API-call case. */
export async function hardClosePeriod(id: string): Promise<PeriodResponseDto> {
  return unwrapApiResult<PeriodResponseDto>(
    await apiClient.POST("/api/v1/accounting/periods/{id}/hard-close", { params: { path: { id } } }),
  );
}
