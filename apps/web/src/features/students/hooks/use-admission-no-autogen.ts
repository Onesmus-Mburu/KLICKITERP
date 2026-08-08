"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdmissionNoAutogenSettingDto } from "@klickit/contracts";
import { getAdmissionNoAutogenSetting, setAdmissionNoAutogenSetting } from "../api/admission-no-autogen.api";

/**
 * Phase 6 Slice 2b item 8 — `student-form.tsx` reads this to decide whether
 * to show a real `admissionNo` input or "Will be auto-generated" helper
 * text; the new Classes & Streams management page's Admission Number
 * Settings panel reads+writes it.
 */
export const ADMISSION_NO_AUTOGEN_QUERY_KEY = ["students", "settings", "admission-no-autogen"] as const;

export function useAdmissionNoAutogenSetting() {
  return useQuery({
    queryKey: ADMISSION_NO_AUTOGEN_QUERY_KEY,
    queryFn: getAdmissionNoAutogenSetting,
  });
}

export function useSetAdmissionNoAutogenSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AdmissionNoAutogenSettingDto) => setAdmissionNoAutogenSetting(dto),
    onSuccess: (data) => {
      queryClient.setQueryData(ADMISSION_NO_AUTOGEN_QUERY_KEY, data);
    },
  });
}
