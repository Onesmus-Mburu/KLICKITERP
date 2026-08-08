import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { decryptFromBuffer, encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";
import { IntgWebhookSubscriptionRepository } from "../infrastructure/intg-webhook-subscription.repository";

export interface CreateWebhookSubscriptionInput {
  url: string;
  secret: string;
  events: string[];
  isActive?: boolean;
}

export interface UpdateWebhookSubscriptionInput {
  url?: string;
  events?: string[];
}

/**
 * CRUD for `intg_webhook_subscription` (FR-INTG-007.1). `secret` is
 * AES-256-GCM-encrypted into `secret_enc` here (same envelope-encryption
 * discipline `IntegrationConfigService.encode()`/`decode()` establishes for
 * `set_integration_config.config_enc`) — `list()`/`findByIdOrFail()` never
 * decrypt it; only `getDecryptedSecret()`, a dedicated internal method
 * `WebhookDeliveryService` calls to sign each delivery, ever reads the plain
 * secret back out.
 */
@Injectable()
export class WebhookSubscriptionsService {
  constructor(
    private readonly subscriptionRepository: IntgWebhookSubscriptionRepository,
    private readonly config: AppConfigService,
  ) {}

  async create(input: CreateWebhookSubscriptionInput, actorId: string | null): Promise<IntgWebhookSubscriptionEntity> {
    if (input.events.length === 0) {
      throw new ValidationException("A webhook subscription requires at least one subscribed event");
    }
    return this.subscriptionRepository.create({
      url: input.url,
      secretEnc: this.encode(input.secret),
      events: input.events,
      isActive: input.isActive ?? true,
      disabledReason: null,
      failureStreakStartedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<IntgWebhookSubscriptionEntity[]> {
    return this.subscriptionRepository.list();
  }

  async findByIdOrFail(id: string): Promise<IntgWebhookSubscriptionEntity> {
    return this.subscriptionRepository.findByIdOrFail(id);
  }

  async update(id: string, changes: UpdateWebhookSubscriptionInput, actorId: string | null): Promise<IntgWebhookSubscriptionEntity> {
    const row = await this.subscriptionRepository.findByIdOrFail(id);
    if (changes.url !== undefined) row.url = changes.url;
    if (changes.events !== undefined) {
      if (changes.events.length === 0) {
        throw new ValidationException("A webhook subscription requires at least one subscribed event");
      }
      row.events = changes.events;
    }
    row.updatedBy = actorId;
    return this.subscriptionRepository.save(row);
  }

  async rotateSecret(id: string, newSecret: string, actorId: string | null): Promise<IntgWebhookSubscriptionEntity> {
    const row = await this.subscriptionRepository.findByIdOrFail(id);
    row.secretEnc = this.encode(newSecret);
    row.updatedBy = actorId;
    return this.subscriptionRepository.save(row);
  }

  /**
   * Manual disable/re-enable (also called automatically by
   * `WebhookDeliveryService.attemptDelivery()` for the FR-INTG-007.1
   * auto-disable rule — that call site passes the open delivery-transaction
   * `EntityManager` so the subscription flip commits atomically with the
   * triggering delivery row).
   */
  async disable(id: string, reason: string, actorId: string | null, manager?: EntityManager): Promise<IntgWebhookSubscriptionEntity> {
    const row = await this.subscriptionRepository.findByIdOrFail(id, manager);
    row.isActive = false;
    row.disabledReason = reason;
    row.updatedBy = actorId;
    return this.subscriptionRepository.save(row, manager);
  }

  async enable(id: string, actorId: string | null): Promise<IntgWebhookSubscriptionEntity> {
    const row = await this.subscriptionRepository.findByIdOrFail(id);
    row.isActive = true;
    row.disabledReason = null;
    row.failureStreakStartedAt = null;
    row.updatedBy = actorId;
    return this.subscriptionRepository.save(row);
  }

  /** Internal-only — never called from a controller, only `WebhookDeliveryService.attemptDelivery()`. */
  async getDecryptedSecret(id: string, manager?: EntityManager): Promise<string> {
    const row = await this.subscriptionRepository.findByIdOrFail(id, manager);
    return this.decode(row.secretEnc);
  }

  private encode(secret: string): Buffer {
    return encryptToBuffer(secret, this.config.appEncryptionKeyBase64);
  }

  private decode(secretEnc: Buffer): string {
    return decryptFromBuffer(secretEnc, this.config.appEncryptionKeyBase64);
  }
}
