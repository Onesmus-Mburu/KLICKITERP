import type { ListWebhookDeliveriesResponseDto, ProcessDueResponseDto, WebhookDeliveryResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD";

/**
 * Thin wrapper over `WebhookDeliveriesController`
 * (`packages/server/src/domains/integrations/api/webhook-deliveries.controller.ts`)
 * — `integrations:webhook:view` covers list/detail, `integrations:webhook:retry`
 * covers the two manual trigger routes. `list()` is genuinely paginated
 * (`{items, meta}`), unlike `WebhookSubscriptionsController.list()`'s bare
 * array — confirmed by reading the controller directly. No scheduler exists
 * anywhere in this codebase (`WebhookDeliveryService`'s own class doc
 * comment) — `processDueWebhookDeliveries()` is a deliberate, manually
 * triggered admin action, never something assumed to run in the background.
 */
export interface ListWebhookDeliveriesParams {
  subscriptionId?: string;
  status?: WebhookDeliveryStatus;
  page?: number;
  pageSize?: number;
}

/**
 * `optionalQuery()`'s generic constraint (`T extends Record<string, ...>`)
 * only structurally satisfies a FRESH object literal argument — TypeScript's
 * generic-inference rules give a fresh literal expression an implicit index
 * signature for constraint-satisfaction purposes, but a pre-typed named
 * interface variable (like `params: ListWebhookDeliveriesParams`) has no
 * such signature and fails the same check (`features/payments/api/
 * receipts.api.ts`'s own `listAllReceipts()` establishes the same
 * "rebuild as an inline literal" workaround for the identical TS quirk) —
 * so the params are re-spread into a fresh literal here rather than passed
 * straight through.
 */
export async function listWebhookDeliveries(params: ListWebhookDeliveriesParams = {}): Promise<ListWebhookDeliveriesResponseDto> {
  return unwrapApiResult<ListWebhookDeliveriesResponseDto>(
    await apiClient.GET("/api/v1/integrations/webhook-deliveries", {
      params: {
        query: optionalQuery({
          subscriptionId: params.subscriptionId,
          status: params.status,
          page: params.page,
          pageSize: params.pageSize,
        }),
      },
    }),
  );
}

export async function getWebhookDelivery(id: string): Promise<WebhookDeliveryResponseDto> {
  return unwrapApiResult<WebhookDeliveryResponseDto>(
    await apiClient.GET("/api/v1/integrations/webhook-deliveries/{id}", { params: { path: { id } } }),
  );
}

/** `POST .../{id}/retry` — manually attempt one delivery immediately, regardless of `next_retry_at`. */
export async function retryWebhookDelivery(id: string): Promise<WebhookDeliveryResponseDto> {
  return unwrapApiResult<WebhookDeliveryResponseDto>(
    await apiClient.POST("/api/v1/integrations/webhook-deliveries/{id}/retry", { params: { path: { id } } }),
  );
}

/** `POST /process-due` — the manual batch substitute for the scheduler this codebase deliberately does not have; findDueForRetry() + attemptDelivery() each, partial-failure-tolerant. */
export async function processDueWebhookDeliveries(): Promise<ProcessDueResponseDto> {
  return unwrapApiResult<ProcessDueResponseDto>(await apiClient.POST("/api/v1/integrations/webhook-deliveries/process-due"));
}
