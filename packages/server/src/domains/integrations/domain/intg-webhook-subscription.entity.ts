import { Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `intg_webhook_subscription` (docs/phase-4/04-schema-operations.md
 * §6) — Module 19 (Integrations). A registered outbound webhook target:
 * `url` (POST destination), `secret_enc` (AES-256-GCM-encrypted HMAC signing
 * secret, envelope-encrypted here exactly like `set_integration_config.config_enc`
 * / `usr_user.twofa_secret_enc` — encryption/decryption happens in
 * `WebhookSubscriptionsService`, never here), `events` (the event-type
 * subscription filter — `varchar(50)[]`, array-contains-queried by
 * `IntgWebhookSubscriptionRepository.findActiveForEvent()`).
 *
 * `is_active`/`disabled_reason`/`failure_streak_started_at` back FR-INTG-007.1's
 * auto-disable mechanism: `failure_streak_started_at` is set to the moment of
 * the FIRST hard failure since the subscription's last success (cleared on
 * every successful delivery); `WebhookDeliveryService.attemptDelivery()`
 * checks elapsed time against it on every subsequent failure and flips
 * `is_active=false` + `disabled_reason` once 72h have elapsed since that
 * streak started (see that service's own doc comment for the full mechanism
 * and worked example).
 */
@Entity("intg_webhook_subscription")
export class IntgWebhookSubscriptionEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 300, name: "url" })
  url!: string;

  @Column({ type: "bytea", name: "secret_enc" })
  secretEnc!: Buffer;

  @Column({ type: "varchar", length: 50, name: "events", array: true, default: [] })
  events!: string[];

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "text", name: "disabled_reason", nullable: true })
  disabledReason!: string | null;

  @Column({ type: "timestamptz", name: "failure_streak_started_at", nullable: true })
  failureStreakStartedAt!: Date | null;
}
