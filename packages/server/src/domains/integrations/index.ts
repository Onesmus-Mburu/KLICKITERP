/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 19
 * (Integrations).
 */
export { IntegrationsModule } from "./integrations.module";

export { WebhookSubscriptionsService } from "./application/webhook-subscriptions.service";
export type { CreateWebhookSubscriptionInput, UpdateWebhookSubscriptionInput } from "./application/webhook-subscriptions.service";
export {
  WebhookDeliveryService,
  WEBHOOK_BACKOFF_SCHEDULE_MINUTES,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_AUTO_DISABLE_THRESHOLD_MS,
} from "./application/webhook-delivery.service";
export { AccountingSyncService } from "./application/accounting-sync.service";
export type { PushEntityInput } from "./application/accounting-sync.service";

export { IntgWebhookSubscriptionEntity } from "./domain/intg-webhook-subscription.entity";
export {
  IntgWebhookDeliveryEntity,
  INTG_WEBHOOK_DELIVERY_STATUSES,
} from "./domain/intg-webhook-delivery.entity";
export type { IntgWebhookDeliveryStatus } from "./domain/intg-webhook-delivery.entity";
export {
  IntgSyncLogEntity,
  INTG_SYNC_LOG_KINDS,
  INTG_SYNC_LOG_DIRECTIONS,
  INTG_SYNC_LOG_STATUSES,
} from "./domain/intg-sync-log.entity";
export type { IntgSyncLogKind, IntgSyncLogDirection, IntgSyncLogStatus } from "./domain/intg-sync-log.entity";

export { IntgWebhookSubscriptionRepository } from "./infrastructure/intg-webhook-subscription.repository";
export { IntgWebhookDeliveryRepository } from "./infrastructure/intg-webhook-delivery.repository";
export type { ListDeliveriesOptions } from "./infrastructure/intg-webhook-delivery.repository";
export { IntgSyncLogRepository } from "./infrastructure/intg-sync-log.repository";
export type { ListSyncLogOptions } from "./infrastructure/intg-sync-log.repository";
export { AccountingSyncResolverService } from "./infrastructure/accounting-sync-resolver.service";
export type { AccountingSyncKind } from "./infrastructure/accounting-sync-resolver.service";
export type {
  AccountingSyncEntityKind,
  AccountingSyncPort,
  AccountingSyncPushResult,
  AccountingSyncTestResult,
} from "./infrastructure/ports/accounting-sync.port";
