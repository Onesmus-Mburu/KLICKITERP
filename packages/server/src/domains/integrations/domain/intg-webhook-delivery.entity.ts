import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { IntgWebhookSubscriptionEntity } from "./intg-webhook-subscription.entity";

export type IntgWebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD";
export const INTG_WEBHOOK_DELIVERY_STATUSES: readonly IntgWebhookDeliveryStatus[] = [
  "PENDING",
  "DELIVERED",
  "FAILED",
  "DEAD",
];

/**
 * Maps to `intg_webhook_delivery` (docs/phase-4/04-schema-operations.md §6)
 * — Module 19 (Integrations). One row per subscription per dispatched event
 * (`WebhookDeliveryService.dispatch()`), genuinely progressing through
 * `status` as `attemptDelivery()` runs: `PENDING` (queued, never attempted)
 * -> `DELIVERED` (2xx response) or `FAILED` (will retry, `next_retry_at` set
 * per the documented 8-step backoff schedule) -> eventually `DEAD` (attempt 8
 * exhausted, terminal — no further retry is ever scheduled). `DEAD` is
 * distinct from `FAILED`: `FAILED` is still retryable and picked up by
 * `findDueForRetry()`; `DEAD` never is again (excluded from the partial
 * index below, same as `DELIVERED`).
 *
 * `ix_intg_webhook_delivery_due` is the partial index the schema DDL calls
 * out explicitly (`WHERE status IN ('PENDING','FAILED')`) — the exact
 * predicate `IntgWebhookDeliveryRepository.findDueForRetry()` queries
 * against, so every lookup that matters is fully served by this index; rows
 * that reach `DELIVERED`/`DEAD` fall out of it permanently.
 */
@Entity("intg_webhook_delivery")
@Index("ix_intg_webhook_delivery_subscription", ["subscriptionId"])
@Check("ck_intg_webhook_delivery_status", `"status" IN ('PENDING','DELIVERED','FAILED','DEAD')`)
export class IntgWebhookDeliveryEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "subscription_id" })
  subscriptionId!: string;

  @ManyToOne(() => IntgWebhookSubscriptionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "subscription_id" })
  subscription?: IntgWebhookSubscriptionEntity;

  @Column({ type: "varchar", length: 50, name: "event_type" })
  eventType!: string;

  @Column({ type: "jsonb", name: "payload" })
  payload!: Record<string, unknown>;

  @Column({ type: "int", name: "attempt", default: 0 })
  attempt!: number;

  @Column({ type: "varchar", length: 10, name: "status", default: "PENDING" })
  status!: IntgWebhookDeliveryStatus;

  @Column({ type: "int", name: "response_code", nullable: true })
  responseCode!: number | null;

  @Column({ type: "timestamptz", name: "next_retry_at" })
  nextRetryAt!: Date;
}
