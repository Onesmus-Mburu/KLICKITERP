import type { CreateAcademicYearDto, CreateTermDto, SetBillingLockDto, UpdateAcademicYearDto, UpdateTermDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { AcademicYearResponse, TermResponse } from "../types";
import { optionalQuery } from "./query-params";

/**
 * Phase 6 Slice 11 Part 1 — settings-scoped wrapper over
 * `AcademicCalendarController`, covering EVERY endpoint on it (list/create
 * were already wrapped, billing-scoped, by `features/billing/api/
 * academic-calendar.api.ts` — this is a deliberate duplicate, not a
 * refactor of that file, matching this monorepo's established
 * per-feature-folder self-containment convention; see `../types.ts`'s own
 * doc comment). The new mutation wrappers here (`updateAcademicYear`/
 * `setCurrentAcademicYear`/`updateTerm`/`setCurrentTerm`/
 * `setTermBillingLock`) have NO existing frontend caller anywhere in this
 * app before this pass — this settings area (`app/(erp)/settings/
 * academic-calendar/page.tsx`) is the first.
 *
 * `settings:academic-year:view`/`:manage` and `settings:term:view`/`:manage`
 * gate these exactly as `AcademicCalendarController` declares (confirmed by
 * reading it directly) — `view` covers every GET, `manage` covers every
 * POST/PATCH. Every response here is hand-typed (see `../types.ts`) since
 * none of the controller's 11 handlers carry an `@ApiResponse({type})`
 * decorator.
 */
export async function listAcademicYears(): Promise<AcademicYearResponse[]> {
  return unwrapApiResult<AcademicYearResponse[]>(await apiClient.GET("/api/v1/academic-years"));
}

export async function createAcademicYear(dto: CreateAcademicYearDto): Promise<AcademicYearResponse> {
  return unwrapApiResult<AcademicYearResponse>(await apiClient.POST("/api/v1/academic-years", { body: dto }));
}

export async function getAcademicYear(id: string): Promise<AcademicYearResponse> {
  return unwrapApiResult<AcademicYearResponse>(await apiClient.GET("/api/v1/academic-years/{id}", { params: { path: { id } } }));
}

export async function updateAcademicYear(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYearResponse> {
  return unwrapApiResult<AcademicYearResponse>(
    await apiClient.PATCH("/api/v1/academic-years/{id}", { params: { path: { id } }, body: dto }),
  );
}

/** Atomically unsets whichever year was previously current — see `AcademicCalendarService.setCurrentYear()`'s own doc comment. */
export async function setCurrentAcademicYear(id: string): Promise<AcademicYearResponse> {
  return unwrapApiResult<AcademicYearResponse>(
    await apiClient.POST("/api/v1/academic-years/{id}/set-current", { params: { path: { id } } }),
  );
}

export async function listTerms(academicYearId?: string): Promise<TermResponse[]> {
  return unwrapApiResult<TermResponse[]>(
    await apiClient.GET("/api/v1/terms", { params: { query: optionalQuery({ academicYearId }) } }),
  );
}

export async function createTerm(dto: CreateTermDto): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(await apiClient.POST("/api/v1/terms", { body: dto }));
}

export async function getTerm(id: string): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(await apiClient.GET("/api/v1/terms/{id}", { params: { path: { id } } }));
}

/** `seq`/`startsOn`/`endsOn` are rejected server-side (422) while the term is billing-locked — only send fields the caller actually wants to change, never resend an unchanged value (the service rejects on the KEY being present in the payload, not on the value differing — see `AcademicCalendarService.updateTerm()`). */
export async function updateTerm(id: string, dto: UpdateTermDto): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(await apiClient.PATCH("/api/v1/terms/{id}", { params: { path: { id } }, body: dto }));
}

/** Atomically unsets whichever term was previously current (global, not scoped by academic year) — see `AcademicCalendarService.setCurrentTerm()`'s own doc comment. */
export async function setCurrentTerm(id: string): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(await apiClient.POST("/api/v1/terms/{id}/set-current", { params: { path: { id } } }));
}

export async function setTermBillingLock(id: string, dto: SetBillingLockDto): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(
    await apiClient.PATCH("/api/v1/terms/{id}/billing-lock", { params: { path: { id } }, body: dto }),
  );
}
