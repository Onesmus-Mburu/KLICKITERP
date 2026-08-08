import type { AdmissionNoAutogenSettingDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 2b item 8 — thin wrapper over `StudentsController`'s two new
 * `students/settings/admission-no-autogen` endpoints
 * (`packages/server/src/domains/students/api/students.controller.ts`).
 */
export async function getAdmissionNoAutogenSetting(): Promise<AdmissionNoAutogenSettingDto> {
  return unwrapApiResult<AdmissionNoAutogenSettingDto>(await apiClient.GET("/api/v1/students/settings/admission-no-autogen"));
}

export async function setAdmissionNoAutogenSetting(dto: AdmissionNoAutogenSettingDto): Promise<AdmissionNoAutogenSettingDto> {
  return unwrapApiResult<AdmissionNoAutogenSettingDto>(
    await apiClient.PUT("/api/v1/students/settings/admission-no-autogen", { body: dto }),
  );
}
