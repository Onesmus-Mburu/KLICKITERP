import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { NotificationsService } from "../../../platform/comms";
import { IntgWebhookDeliveryEntity } from "../domain/intg-webhook-delivery.entity";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";
import { IntgWebhookDeliveryRepository } from "../infrastructure/intg-webhook-delivery.repository";
import { IntgWebhookSubscriptionRepository } from "../infrastructure/intg-webhook-subscription.repository";
import { WebhookHttpClient, WebhookHttpError } from "../infrastructure/webhook-http-client";
import { WebhookSubscriptionsService } from "./webhook-subscriptions.service";

/**
 * FR-INTG-007.1's exact 8-step retry schedule — the delay (in minutes)
 * applied AFTER the Nth failed attempt before the (N+1)th is retried,
 * indexed `[attempt - 1]` (attempt is 1-based, post-increment). Deliberately
 * "exponential-ish", not perfectly geometric: 1min / 5min / 15min / 1h / 3h /
 * 6h / 12h / 24h. The CUMULATIVE elapsed time from the first failure through
 * the start of the 8th (final) attempt is the sum of the first 7 deltas —
 * 1+5+15+60+180+360+720 = 1341 minutes ≈ 22h21m — matching FR-INTG-007.1's
 * "retries 8× over 24 hours" (the 8th entry, 24h, is the delay a would-be 9th
 * attempt would use; it is never actually scheduled because attempt 8's own
 * failure goes straight to `DEAD` instead of a 9th `FAILED` retry — kept in
 * the array for documentation symmetry with "8 steps", and because
 * `next_retry_at` is still computed and stored on the DEAD row per this
 * service's own`attemptDelivery()` doc comment, even though nothing will
 * ever query for it again).
 */
export const WEBHOOK_BACKOFF_SCHEDULE_MINUTES: readonly number[] = [1, 5, 15, 60, 180, 360, 720, 1440];
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_BACKOFF_SCHEDULE_MINUTES.length;

/** FR-INTG-007.1 auto-disable threshold — 72 hours of hard failures since the streak's first failure. */
export const WEBHOOK_AUTO_DISABLE_THRESHOLD_MS = 72 * 60 * 60 * 1000;

/**
 * THE core engine (FR-INTG-007.1). Three entrypoints:
 *
 * - `dispatch(em, eventType, payload)` — the fan-out: finds every active
 *   subscription for `eventType` and creates one `PENDING` delivery row per
 *   match, `next_retry_at=now()` so it is immediately eligible for
 *   `processDue()`. This is the method other modules COULD call when they
 *   emit a domain event; NO automatic wiring exists yet from this codebase's
 *   outbox events (`shared/events/outbox.entity.ts`) to this method — there
 *   is no outbox dispatcher/worker anywhere in this codebase at all (the
 *   same documented gap `NotificationsService`'s own class doc comment
 *   flags for `comms.*` BullMQ queues), so for now `dispatch()` is a
 *   directly-callable service method a future caller wires up explicitly,
 *   not something that fires on its own.
 *
 * - `attemptDelivery(em, deliveryId)` — signs and POSTs one delivery.
 *   Signature header, EXACTLY per FR-INTG-007.1:
 *   `X-Klickit-Signature: t=<unix-seconds>,v1=<hex HMAC-SHA256>`, where the
 *   HMAC is computed over the literal string `${timestamp}.${rawJsonBody}`,
 *   keyed by the subscription's decrypted secret. On a 2xx response:
 *   `status='DELIVERED'`, `response_code` set, and the subscription's
 *   `failure_streak_started_at` is cleared (a fresh success resets the
 *   streak). On any other outcome (network error, timeout, non-2xx):
 *   `attempt` is incremented, `response_code` recorded when known,
 *   `next_retry_at` computed from `WEBHOOK_BACKOFF_SCHEDULE_MINUTES[attempt-1]`,
 *   and `status` becomes `'DEAD'` once `attempt >= WEBHOOK_MAX_ATTEMPTS`
 *   (8), else `'FAILED'`. Every failure also runs the 72h auto-disable
 *   check against the SUBSCRIPTION (not the individual delivery — a
 *   subscription can keep accumulating failures across many different
 *   dispatched deliveries, e.g. distinct events, even after any one
 *   delivery's own 8-attempt cycle has gone `DEAD`): if the subscription has
 *   no open failure streak yet, this failure STARTS one
 *   (`failure_streak_started_at = now()`); if a streak is already open and
 *   `now() - failure_streak_started_at >= 72h`, the subscription is
 *   auto-disabled (`WebhookSubscriptionsService.disable()`) with a
 *   documented reason, and a best-effort admin alert is sent via
 *   `platform/comms`' `NotificationsService` (EMAIL, to
 *   `AppConfigService.integrationsAdminAlertEmail`) — failure to send the
 *   alert is logged and swallowed, never allowed to fail the delivery
 *   attempt itself (the "documented if it can't cleanly resolve" pattern
 *   this codebase already uses for `PaymentVouchersService`'s remittance
 *   email).
 *
 * - `processDue(em)` — a MANUAL trigger only; no scheduler/worker exists
 *   anywhere in this codebase (same gap `dispatch()`'s own doc comment
 *   flags). Calls `findDueForRetry(now())` and `attemptDelivery()`s each
 *   result, partial-failure-tolerant: one delivery throwing does not abort
 *   the batch (each attempt is wrapped in its own try/catch, matching
 *   `ReportSchedulesService.runDue()`'s own batch-tolerance shape).
 *
 * **Worked signature example** (also asserted byte-for-byte in this
 * service's own spec file): secret `"whsec_test"`, timestamp `1700000000`,
 * body `{"hello":"world"}` ->
 * `X-Klickit-Signature: t=1700000000,v1=` + hex HMAC-SHA256 of
 * `"1700000000.{"hello":"world"}"` keyed by `"whsec_test"`.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly subscriptionRepository: IntgWebhookSubscriptionRepository,
    private readonly deliveryRepository: IntgWebhookDeliveryRepository,
    private readonly webhookSubscriptionsService: WebhookSubscriptionsService,
    private readonly notificationsService: NotificationsService,
    private readonly config: AppConfigService,
    private readonly httpClient: WebhookHttpClient,
  ) {}

  async dispatch(em: EntityManager, eventType: string, payload: Record<string, unknown>): Promise<IntgWebhookDeliveryEntity[]> {
    const subscriptions = await this.subscriptionRepository.findActiveForEvent(eventType, em);
    const created: IntgWebhookDeliveryEntity[] = [];
    for (const subscription of subscriptions) {
      created.push(
        await this.deliveryRepository.create(
          {
            subscriptionId: subscription.id,
            eventType,
            payload,
            attempt: 0,
            status: "PENDING",
            responseCode: null,
            nextRetryAt: new Date(),
          },
          em,
        ),
      );
    }
    return created;
  }

  async attemptDelivery(em: EntityManager, deliveryId: string): Promise<IntgWebhookDeliveryEntity> {
    const delivery = await this.deliveryRepository.findByIdOrFail(deliveryId, em);
    const subscription = await this.subscriptionRepository.findByIdOrFail(delivery.subscriptionId, em);
    const secret = await this.webhookSubscriptionsService.getDecryptedSecret(subscription.id, em);

    const bodyText = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${bodyText}`).digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    try {
      const statusCode = await this.httpClient.post(subscription.url, bodyText, signatureHeader);
      delivery.status = "DELIVERED";
      delivery.responseCode = statusCode;
      const saved = await this.deliveryRepository.save(delivery, em);

      if (subscription.failureStreakStartedAt) {
        subscription.failureStreakStartedAt = null;
        await this.subscriptionRepository.save(subscription, em);
      }
      return saved;
    } catch (error) {
      const httpError = error instanceof WebhookHttpError ? error : null;
      delivery.attempt += 1;
      delivery.responseCode = httpError?.statusCode ?? null;
      delivery.nextRetryAt = new Date(Date.now() + WEBHOOK_BACKOFF_SCHEDULE_MINUTES[delivery.attempt - 1] * 60_000);
      delivery.status = delivery.attempt >= WEBHOOK_MAX_ATTEMPTS ? "DEAD" : "FAILED";
      const saved = await this.deliveryRepository.save(delivery, em);

      await this.registerFailureAndMaybeDisable(em, subscription);
      return saved;
    }
  }

  async processDue(em: EntityManager): Promise<{ processed: number; failed: number }> {
    const due = await this.deliveryRepository.findDueForRetry(new Date(), em);
    let processed = 0;
    let failed = 0;
    for (const delivery of due) {
      try {
        await this.attemptDelivery(em, delivery.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`processDue: delivery ${delivery.id} failed to process: ${(error as Error).message}`);
      }
    }
    return { processed, failed };
  }

  private async registerFailureAndMaybeDisable(em: EntityManager, subscription: IntgWebhookSubscriptionEntity): Promise<void> {
    if (!subscription.isActive) return;
    // `Date.now()`, not `new Date()` — kept consistent with attemptDelivery()'s
    // own timestamp/next_retry_at computation above (both `Date.now()`-based)
    // so a test can deterministically control "now" via a single `Date.now`
    // spy; `new Date()` does NOT delegate to a monkey-patched `Date.now`.
    const nowMs = Date.now();

    if (!subscription.failureStreakStartedAt) {
      subscription.failureStreakStartedAt = new Date(nowMs);
      await this.subscriptionRepository.save(subscription, em);
      return;
    }

    const elapsedMs = nowMs - subscription.failureStreakStartedAt.getTime();
    if (elapsedMs >= WEBHOOK_AUTO_DISABLE_THRESHOLD_MS) {
      const reason = `Auto-disabled per FR-INTG-007.1: delivery failures persisted for >= 72h (streak started ${subscription.failureStreakStartedAt.toISOString()})`;
      await this.webhookSubscriptionsService.disable(subscription.id, reason, null, em);
      await this.alertAdmin(subscription, reason);
    }
  }

  /** Best-effort — a failed admin alert never fails the triggering delivery attempt, only logged. */
  private async alertAdmin(subscription: IntgWebhookSubscriptionEntity, reason: string): Promise<void> {
    try {
      await this.notificationsService.send({
        channel: "EMAIL",
        recipient: this.config.integrationsAdminAlertEmail,
        subject: "Klickit ERP — webhook subscription auto-disabled",
        body: `Webhook subscription ${subscription.id} (${subscription.url}) was auto-disabled. ${reason}`,
        entityType: "intg_webhook_subscription",
        entityId: subscription.id,
      });
    } catch (error) {
      this.logger.warn(`Best-effort admin alert failed for subscription ${subscription.id}: ${(error as Error).message}`);
    }
  }
}
