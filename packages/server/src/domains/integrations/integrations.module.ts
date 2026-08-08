import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IntgWebhookSubscriptionEntity } from "./domain/intg-webhook-subscription.entity";
import { IntgWebhookDeliveryEntity } from "./domain/intg-webhook-delivery.entity";
import { IntgSyncLogEntity } from "./domain/intg-sync-log.entity";
import { SettingsModule } from "../../platform/settings";
import { CommsModule } from "../../platform/comms";
import { IntgWebhookSubscriptionRepository } from "./infrastructure/intg-webhook-subscription.repository";
import { IntgWebhookDeliveryRepository } from "./infrastructure/intg-webhook-delivery.repository";
import { IntgSyncLogRepository } from "./infrastructure/intg-sync-log.repository";
import { SyncLogOnlyAdapter } from "./infrastructure/adapters/sync-log-only.adapter";
import { AccountingSyncResolverService } from "./infrastructure/accounting-sync-resolver.service";
import { WebhookHttpClient } from "./infrastructure/webhook-http-client";
import { WebhookSubscriptionsService } from "./application/webhook-subscriptions.service";
import { WebhookDeliveryService } from "./application/webhook-delivery.service";
import { AccountingSyncService } from "./application/accounting-sync.service";
import { WebhookSubscriptionsController } from "./api/webhook-subscriptions.controller";
import { WebhookDeliveriesController } from "./api/webhook-deliveries.controller";
import { SyncController } from "./api/sync.controller";

/**
 * Module 19 (Integrations) — DELIBERATELY NARROW in scope per its own task
 * brief: this module TRANSMITS what other modules hand it (webhook
 * payloads, sync entity data), it does not independently query other
 * domains' data, so unlike Module 18 (Reporting)'s deliberately-BROAD
 * `module-deps.json` entry, `domains/integrations` only imports
 * `platform/settings` (`IntegrationConfigService`, resolving the enabled
 * `QUICKBOOKS`/`XERO`/`SAGE` accounting-sync config) and `platform/comms`
 * (`NotificationsService`, the FR-INTG-007.1 auto-disable admin alert) —
 * both via their public barrels only, never their repositories/application
 * internals directly.
 *
 * **Controllers array verified explicitly** — per this task's own standing
 * warning about a past near-miss (a `controllers` array once forgotten
 * despite `tsc` passing clean, shipping unreachable routes) and Module 18's
 * own wildcard-vs-static route-collision lesson (checked on
 * `WebhookDeliveriesController`'s own doc comment — no collision here, all
 * 3 controllers below use non-overlapping path prefixes:
 * `integrations/webhook-subscriptions`, `integrations/webhook-deliveries`,
 * `integrations/sync`): all 3 controllers (`WebhookSubscriptionsController`,
 * `WebhookDeliveriesController`, `SyncController`) ARE present.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([IntgWebhookSubscriptionEntity, IntgWebhookDeliveryEntity, IntgSyncLogEntity]),
    SettingsModule,
    CommsModule,
  ],
  controllers: [WebhookSubscriptionsController, WebhookDeliveriesController, SyncController],
  providers: [
    IntgWebhookSubscriptionRepository,
    IntgWebhookDeliveryRepository,
    IntgSyncLogRepository,
    SyncLogOnlyAdapter,
    AccountingSyncResolverService,
    WebhookHttpClient,
    WebhookSubscriptionsService,
    WebhookDeliveryService,
    AccountingSyncService,
  ],
  exports: [
    IntgWebhookSubscriptionRepository,
    IntgWebhookDeliveryRepository,
    IntgSyncLogRepository,
    WebhookSubscriptionsService,
    WebhookDeliveryService,
    AccountingSyncService,
  ],
})
export class IntegrationsModule {}
