import type { ListSyncLogResponseDto, TestConnectionResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

export type AccountingSyncKind = "QUICKBOOKS" | "XERO" | "SAGE";
export const ACCOUNTING_SYNC_KINDS: readonly AccountingSyncKind[] = ["QUICKBOOKS", "XERO", "SAGE"];

export type SyncLogStatus = "SUCCESS" | "FAILED";

/**
 * Thin wrapper over `SyncController`
 * (`packages/server/src/domains/integrations/api/sync.controller.ts`) —
 * `integrations:sync:test` covers `testConnection()`,
 * `integrations:sync:view` covers `listLog()`. `push()`/`POST .../sync/push`
 * is deliberately NOT wrapped here — out of scope for this pass (see the
 * plan's own explicit scope boundary: a raw provider-shaped payload only
 * makes sense constructed from a real domain record by that record's own
 * screen, a future integration task).
 *
 * `testConnection()` is the REAL connection test — genuinely distinct from
 * Module 2's own `testIntegrationConfigConnection()`
 * (`features/settings/api/integration-configs.api.ts`), which is a permanent
 * stub for `QUICKBOOKS`/`XERO`/`SAGE` (`"adapter not yet available, config
 * saved"`, confirmed by reading `IntegrationConfigService.stubTestFor()`
 * directly). This one resolves the highest-priority ENABLED
 * `set_integration_config` row of the chosen kind via
 * `AccountingSyncResolverService` and calls the real adapter's
 * `testConnection()` — a genuine outbound network attempt when a config is
 * enabled, or `SyncLogOnlyAdapter`'s honest `{ok:false, message:"no
 * accounting-sync integration config enabled, using log-only fallback"}`
 * when none is.
 */
export interface ListSyncLogParams {
  kind?: AccountingSyncKind;
  entityType?: string;
  entityId?: string;
  status?: SyncLogStatus;
  page?: number;
  pageSize?: number;
}

/** Rebuilt as a fresh object literal before `optionalQuery()` — see `webhook-deliveries.api.ts`'s `listWebhookDeliveries()` doc comment for why a pre-typed named-interface variable fails `optionalQuery()`'s generic constraint while a fresh literal doesn't. */
export async function listSyncLog(params: ListSyncLogParams = {}): Promise<ListSyncLogResponseDto> {
  return unwrapApiResult<ListSyncLogResponseDto>(
    await apiClient.GET("/api/v1/integrations/sync/log", {
      params: {
        query: optionalQuery({
          kind: params.kind,
          entityType: params.entityType,
          entityId: params.entityId,
          status: params.status,
          page: params.page,
          pageSize: params.pageSize,
        }),
      },
    }),
  );
}

export async function testAccountingSyncConnection(kind: AccountingSyncKind): Promise<TestConnectionResponseDto> {
  return unwrapApiResult<TestConnectionResponseDto>(
    await apiClient.POST("/api/v1/integrations/sync/test-connection", { body: { kind } }),
  );
}
