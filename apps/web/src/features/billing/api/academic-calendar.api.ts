import type { CreateAcademicYearDto, CreateTermDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { AcademicYearResponse, TermResponse } from "../types";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `AcademicCalendarController`'s list + create endpoints
 * (`GET`/`POST /academic-years`, `GET`/`POST /terms`) — see `../types.ts`'s
 * doc comment for why the response types are hand-mirrored instead of
 * pulled from `@klickit/contracts` (the GET responses have no
 * `@ApiResponse({type})` decorator server-side). The `POST` request bodies
 * DO have real DTOs (`CreateAcademicYearDto`/`CreateTermDto`), so those are
 * pulled from `@klickit/contracts` as usual. Both list endpoints are bare,
 * unbounded arrays (no pagination — same convention every other Module 8/9
 * list endpoint this codebase has built against so far uses), gated on
 * `settings:academic-year:view` / `settings:term:view` respectively; the
 * two `POST`s are gated on `settings:academic-year:manage` /
 * `settings:term:manage` — the new `AcademicYearWizardDialog` (Phase 6
 * Slice 3b) is the first UI in this app to call them.
 */
export async function listAcademicYears(): Promise<AcademicYearResponse[]> {
  return unwrapApiResult<AcademicYearResponse[]>(await apiClient.GET("/api/v1/academic-years"));
}

export async function listTerms(academicYearId?: string): Promise<TermResponse[]> {
  return unwrapApiResult<TermResponse[]>(
    await apiClient.GET("/api/v1/terms", { params: { query: optionalQuery({ academicYearId }) } }),
  );
}

export async function createAcademicYear(dto: CreateAcademicYearDto): Promise<AcademicYearResponse> {
  return unwrapApiResult<AcademicYearResponse>(await apiClient.POST("/api/v1/academic-years", { body: dto }));
}

export async function createTerm(dto: CreateTermDto): Promise<TermResponse> {
  return unwrapApiResult<TermResponse>(await apiClient.POST("/api/v1/terms", { body: dto }));
}
