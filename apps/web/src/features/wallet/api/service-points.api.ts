import type {
  AssignOperatorDto,
  CreateServicePointDto,
  ServicePointOperatorResponseDto,
  ServicePointResponseDto,
  UpdateServicePointDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `ServicePointsController`
 * (`packages/server/src/domains/wallet/api/service-points.controller.ts`).
 * Phase 6 Slice 11 (Part 2) built `listServicePoints()` only, a plain
 * read-only picker for the Spend dialog's service-point `<Select>` (`GET
 * wallet-service-points`, `wallet:service-point:manage` — the ONLY
 * permission code this controller has for any of its 7 routes, reused as-is
 * below too, no new permission minted). Phase 6 Slice 11 (Part 3) grows this
 * out into the full CRUD + operator assign/unassign surface
 * `wallet/service-points/page.tsx` needs.
 */
export async function listServicePoints(): Promise<ServicePointResponseDto[]> {
  return unwrapApiResult<ServicePointResponseDto[]>(await apiClient.GET("/api/v1/wallet-service-points"));
}

export async function getServicePoint(id: string): Promise<ServicePointResponseDto> {
  return unwrapApiResult<ServicePointResponseDto>(
    await apiClient.GET("/api/v1/wallet-service-points/{id}", { params: { path: { id } } }),
  );
}

export async function createServicePoint(dto: CreateServicePointDto): Promise<ServicePointResponseDto> {
  return unwrapApiResult<ServicePointResponseDto>(await apiClient.POST("/api/v1/wallet-service-points", { body: dto }));
}

export async function updateServicePoint(id: string, dto: UpdateServicePointDto): Promise<ServicePointResponseDto> {
  return unwrapApiResult<ServicePointResponseDto>(
    await apiClient.PATCH("/api/v1/wallet-service-points/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function listServicePointOperators(id: string): Promise<ServicePointOperatorResponseDto[]> {
  return unwrapApiResult<ServicePointOperatorResponseDto[]>(
    await apiClient.GET("/api/v1/wallet-service-points/{id}/operators", { params: { path: { id } } }),
  );
}

export async function assignServicePointOperator(id: string, dto: AssignOperatorDto): Promise<ServicePointOperatorResponseDto> {
  return unwrapApiResult<ServicePointOperatorResponseDto>(
    await apiClient.POST("/api/v1/wallet-service-points/{id}/operators", { params: { path: { id } }, body: dto }),
  );
}

export async function unassignServicePointOperator(id: string, userId: string): Promise<{ ok: true }> {
  return unwrapApiResult<{ ok: true }>(
    await apiClient.DELETE("/api/v1/wallet-service-points/{id}/operators/{userId}", { params: { path: { id, userId } } }),
  );
}
