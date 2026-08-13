import type { CostCenterResponseDto, CreateCostCenterDto, UpdateCostCenterDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — thin
 * wrapper over `CostCentersController`
 * (`packages/server/src/accounting/api/cost-centers.controller.ts`, base
 * `/api/v1/accounting/cost-centers`) — `accounting:cost-center:view` gates
 * list/get, `accounting:cost-center:manage` gates create/update/deactivate/
 * activate (confirmed by reading the controller directly, 67 lines). A flat
 * list, no hierarchy — `CreateCostCenterDto`/`UpdateCostCenterDto`/
 * `CostCenterResponseDto` all have clean, ungapped generated shapes
 * (confirmed directly against `openapi-types.ts`: no nullable fields
 * anywhere on any of the three), so this file needs no request-body cast at
 * all — only the query-param gap below.
 *
 * `CostCentersController_list`'s generated query-param type requires
 * `activeOnly` as a plain (non-optional) `string` even though the real
 * controller (`@Query("activeOnly") activeOnly?: string`) treats it as
 * genuinely optional — same class of gap `accounts.api.ts`'s own
 * `AccountsListQueryShape` doc comment documents for `class`/`isActive`/
 * `parentId`. Fixed the same way: a local `CostCentersListQueryShape`
 * interface, the query object built conditionally (omitted entirely when
 * the caller wants "no filter," never padded with an empty string — reading
 * `CostCentersController.list()` directly confirms `activeOnly === "true"`
 * is the ONLY string that means "filter to active," so an accidental empty
 * string would silently resolve to "filter to active === false," a real
 * wrong-results bug, not a harmless no-op).
 */
interface CostCentersListQueryShape {
  activeOnly?: string;
}

export async function listCostCenters(activeOnly?: boolean): Promise<CostCenterResponseDto[]> {
  const query: CostCentersListQueryShape = {};
  if (activeOnly !== undefined) query.activeOnly = String(activeOnly);
  return unwrapApiResult<CostCenterResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/cost-centers", { params: { query: query as unknown as Required<CostCentersListQueryShape> } }),
  );
}

export async function getCostCenter(id: string): Promise<CostCenterResponseDto> {
  return unwrapApiResult<CostCenterResponseDto>(
    await apiClient.GET("/api/v1/accounting/cost-centers/{id}", { params: { path: { id } } }),
  );
}

export async function createCostCenter(dto: CreateCostCenterDto): Promise<CostCenterResponseDto> {
  return unwrapApiResult<CostCenterResponseDto>(await apiClient.POST("/api/v1/accounting/cost-centers", { body: dto }));
}

export async function updateCostCenter(id: string, dto: UpdateCostCenterDto): Promise<CostCenterResponseDto> {
  return unwrapApiResult<CostCenterResponseDto>(
    await apiClient.PATCH("/api/v1/accounting/cost-centers/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function deactivateCostCenter(id: string): Promise<CostCenterResponseDto> {
  return unwrapApiResult<CostCenterResponseDto>(
    await apiClient.POST("/api/v1/accounting/cost-centers/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateCostCenter(id: string): Promise<CostCenterResponseDto> {
  return unwrapApiResult<CostCenterResponseDto>(
    await apiClient.POST("/api/v1/accounting/cost-centers/{id}/activate", { params: { path: { id } } }),
  );
}
