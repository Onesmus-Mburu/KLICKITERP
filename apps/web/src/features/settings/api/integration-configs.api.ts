import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { IntegrationConfig, IntegrationKind, TestConnectionResult } from "../types";

/**
 * Thin wrapper over `IntegrationConfigsController`
 * (`packages/server/src/platform/settings/api/integration-configs.controller.ts`)
 * — `settings:integration:manage` covers create/update/test-connection,
 * `settings:integration:view` covers list/detail (confirmed by reading the
 * controller directly). See `../types.ts`'s own doc comment for why every
 * response here is hand-typed (`IntegrationConfigsController`'s handlers
 * have zero `@ApiResponse({type})` decorators — a real, confirmed codegen
 * gap, not a bug in this wrapper).
 *
 * `configEnc` (the encrypted credential blob) is stripped from EVERY
 * response by the controller's own `toView()` mapper (confirmed by reading
 * it directly: `const { configEnc: _configEnc, ...view } = entity`) — this
 * app can never read a saved credential back. `updateIntegrationConfig()`'s
 * `config` field is accordingly treated as "replace the whole payload if
 * supplied at all", never a partial-field patch — `<EditIntegrationDialog>`
 * only ever sends a full, freshly-typed `MpesaConfig` when the user
 * deliberately opts into resubmitting credentials, never a merge of new
 * fields onto whatever was there before (which this app has no way to know).
 */
export interface CreateIntegrationConfigInput {
  kind: IntegrationKind;
  name: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
  priority: number;
}

export interface UpdateIntegrationConfigInput {
  name?: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
  priority?: number;
}

export async function listIntegrationConfigs(): Promise<IntegrationConfig[]> {
  return unwrapApiResult<IntegrationConfig[]>(await apiClient.GET("/api/v1/integration-configs"));
}

export async function getIntegrationConfig(id: string): Promise<IntegrationConfig> {
  return unwrapApiResult<IntegrationConfig>(await apiClient.GET("/api/v1/integration-configs/{id}", { params: { path: { id } } }));
}

export async function createIntegrationConfig(input: CreateIntegrationConfigInput): Promise<IntegrationConfig> {
  return unwrapApiResult<IntegrationConfig>(await apiClient.POST("/api/v1/integration-configs", { body: input }));
}

export async function updateIntegrationConfig(id: string, input: UpdateIntegrationConfigInput): Promise<IntegrationConfig> {
  return unwrapApiResult<IntegrationConfig>(
    await apiClient.PATCH("/api/v1/integration-configs/{id}", { params: { path: { id } }, body: input }),
  );
}

/**
 * `POST .../{id}/test-connection` — no body. `MPESA` (Phase 6 Slice 7) now
 * makes a real Daraja OAuth token-fetch attempt server-side (confirmed by
 * reading `IntegrationConfigService.testConnection()`/`testMpesaConnection()`
 * directly); every other kind still returns the hardcoded stub result. Either
 * way this call always succeeds at the HTTP layer (the ok/fail outcome is
 * carried IN the 2xx response body, never as an HTTP error status) — a
 * failed connection test is not an `ApiError` here, it's `result.ok === false`.
 */
export async function testIntegrationConfigConnection(id: string): Promise<TestConnectionResult> {
  return unwrapApiResult<TestConnectionResult>(
    await apiClient.POST("/api/v1/integration-configs/{id}/test-connection", { params: { path: { id } } }),
  );
}
