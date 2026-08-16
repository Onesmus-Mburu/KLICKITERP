"use client";

import { useQuery } from "@tanstack/react-query";
import { getOpsHealth } from "../api/ops.api";

export const OPS_HEALTH_QUERY_KEY = ["backups-ops", "ops-health"] as const;

/** `GET /ops/health` — `ops:health:view`, read-only, no mutations exist on `OpsController` (one `GET`, nothing else). */
export function useOpsHealth() {
  return useQuery({ queryKey: OPS_HEALTH_QUERY_KEY, queryFn: () => getOpsHealth() });
}
