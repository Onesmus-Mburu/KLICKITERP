"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiCallLog, getLicenseStatus, getUpdateNotices } from "../api/license.api";

export const LICENSE_QUERY_KEY = ["licensing"] as const;

/** `GET /license/status` — read-only, no mutations exist anywhere on this module's staff-facing controller. */
export function useLicenseStatus() {
  return useQuery({
    queryKey: [...LICENSE_QUERY_KEY, "status"] as const,
    queryFn: () => getLicenseStatus(),
  });
}

/** `GET /license/api-log`, server-paginated — the caller (the page component) owns `page`/`pageSize` state, same shape as `useWebhookDeliveries()`. */
export function useApiCallLog(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...LICENSE_QUERY_KEY, "api-log", { page, pageSize }] as const,
    queryFn: () => getApiCallLog({ page, pageSize }),
  });
}

/** `GET /license/update-notices` — no pagination params on this route. */
export function useUpdateNotices() {
  return useQuery({
    queryKey: [...LICENSE_QUERY_KEY, "update-notices"] as const,
    queryFn: () => getUpdateNotices(),
  });
}
