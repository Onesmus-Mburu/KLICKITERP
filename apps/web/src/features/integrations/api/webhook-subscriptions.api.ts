import type { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto, WebhookSubscriptionResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `WebhookSubscriptionsController`
 * (`packages/server/src/domains/integrations/api/webhook-subscriptions.controller.ts`)
 * — `integrations:webhook:manage` covers create/update/rotate-secret/
 * disable/enable, `integrations:webhook:view` covers list/detail (confirmed
 * by reading the controller directly). Unlike Module 2's
 * `IntegrationConfigsController`, every handler here carries a real
 * `@ApiResponse({ type })` decorator, so `@klickit/contracts` already has a
 * generated `WebhookSubscriptionResponseDto` — no hand-typed `types.ts`
 * needed for this feature (confirmed by reading
 * `packages/contracts/src/domains/integrations/webhook-subscription.schema.ts`
 * directly).
 *
 * `WebhookSubscriptionResponseDto` never carries `secretEnc`/a decrypted
 * secret — confirmed by reading `WebhookSubscriptionsController`'s own
 * `toView()` mapper directly. `rotateWebhookSecret()`/`createWebhookSubscription()`
 * both SEND a plaintext secret but never receive one back — the same
 * "resubmit, don't pre-fill" honesty Module 2's own MPESA secret handling
 * already established for `configEnc`.
 */
export async function listWebhookSubscriptions(): Promise<WebhookSubscriptionResponseDto[]> {
  return unwrapApiResult<WebhookSubscriptionResponseDto[]>(await apiClient.GET("/api/v1/integrations/webhook-subscriptions"));
}

export async function getWebhookSubscription(id: string): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.GET("/api/v1/integrations/webhook-subscriptions/{id}", { params: { path: { id } } }),
  );
}

/**
 * A real, confirmed codegen gap: `@ApiPropertyOptional({default:true})` on
 * `CreateWebhookSubscriptionDto.isActive` (class-validator, genuinely
 * optional server-side) still comes out as a REQUIRED `boolean` (not
 * `boolean | undefined`) in the generated OpenAPI schema — confirmed by
 * reading `openapi-types.ts`'s own `CreateWebhookSubscriptionDto` entry
 * directly. Same class of `@ApiPropertyOptional()`-annotation-not-surviving-
 * into-"optional" gap this codebase's `custom-fields.api.ts`/`sessions.api.ts`
 * precedents already document. Worked around at this one call boundary by
 * always resolving a real boolean before sending (defaulting to the DTO's
 * own documented `true` default) instead of forwarding a possibly-`undefined`
 * value into a field the generated type requires present.
 */
export async function createWebhookSubscription(input: CreateWebhookSubscriptionDto): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.POST("/api/v1/integrations/webhook-subscriptions", {
      body: { url: input.url, secret: input.secret, events: input.events, isActive: input.isActive ?? true },
    }),
  );
}

export async function updateWebhookSubscription(id: string, input: UpdateWebhookSubscriptionDto): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.PATCH("/api/v1/integrations/webhook-subscriptions/{id}", { params: { path: { id } }, body: input }),
  );
}

/** `POST .../{id}/rotate-secret {secret}` — write-once, never shown again: the caller must type a brand-new secret, this is never called with the old value pre-filled anywhere in this feature's UI. */
export async function rotateWebhookSecret(id: string, secret: string): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.POST("/api/v1/integrations/webhook-subscriptions/{id}/rotate-secret", { params: { path: { id } }, body: { secret } }),
  );
}

export async function disableWebhookSubscription(id: string, reason: string): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.POST("/api/v1/integrations/webhook-subscriptions/{id}/disable", { params: { path: { id } }, body: { reason } }),
  );
}

export async function enableWebhookSubscription(id: string): Promise<WebhookSubscriptionResponseDto> {
  return unwrapApiResult<WebhookSubscriptionResponseDto>(
    await apiClient.POST("/api/v1/integrations/webhook-subscriptions/{id}/enable", { params: { path: { id } } }),
  );
}
