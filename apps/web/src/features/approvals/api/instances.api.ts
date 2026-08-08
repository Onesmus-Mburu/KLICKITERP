import type { DecideInstanceDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { Instance, InstanceDetail } from "../types";

/**
 * Thin wrapper over `InstancesController`
 * (`packages/server/src/platform/approvals/api/instances.controller.ts`).
 * Permissions: `approvals:instance:view` (list/inbox/findOne),
 * `approvals:instance:decide` (decide). There is deliberately no `submit()`
 * wrapper here — `POST /approvals/instances` doesn't exist as an endpoint at
 * all (submission is always an internal service call composed into another
 * module's own business transaction, per that controller's own doc comment),
 * and no `cancel()` wrapper either — out of scope for this slice (the plan's
 * "operational side only: reviewing/deciding pending approvals").
 */
export interface ListInstancesParams {
  status?: string;
  domainCode?: string;
}

/** `GET /approvals/instances?domainCode=&status=` — both query params are genuinely optional in the real handler (`@Query("status") status?`, `@Query("domainCode") domainCode?`), no required-string codegen quirk here (unlike `banking:account:manage`'s `kind`/`isActive`), so no `optionalQuery()` wrapper is needed. */
export async function listInstances(params: ListInstancesParams = {}): Promise<Instance[]> {
  return unwrapApiResult<Instance[]>(
    await apiClient.GET("/api/v1/approvals/instances", { params: { query: params } }),
  );
}

/** `GET /approvals/instances/inbox` — PENDING instances the caller can personally act on right now; already excludes the caller's own submissions server-side (`listPendingForApprover()`'s own `initiatorId === userId` skip, BR-APPR-01). */
export async function getInbox(): Promise<Instance[]> {
  return unwrapApiResult<Instance[]>(await apiClient.GET("/api/v1/approvals/instances/inbox"));
}

/** `GET /approvals/instances/{id}` — full detail + the real decision trail (`actions`). */
export async function getInstance(id: string): Promise<InstanceDetail> {
  return unwrapApiResult<InstanceDetail>(
    await apiClient.GET("/api/v1/approvals/instances/{id}", { params: { path: { id } } }),
  );
}

/** `POST /approvals/instances/{id}/decide` — `comment` is required server-side for REJECT/RETURN (FR-APPR-003.1, `ValidationException`, 422) — the caller (`DecideButtons`) blocks submission client-side too, but this wrapper doesn't itself enforce it (the DTO's `comment` stays optional, matching `@klickit/contracts`' real generated type). */
export async function decideInstance(id: string, dto: DecideInstanceDto): Promise<Instance> {
  return unwrapApiResult<Instance>(
    await apiClient.POST("/api/v1/approvals/instances/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}
