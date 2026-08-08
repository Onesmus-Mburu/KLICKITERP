import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { generateUuidV7 } from "../ids/uuid7";
import { DomainEvent } from "./domain-event";
import { OutboxEntity } from "./outbox.entity";

/**
 * Writes a domain event to `obx_outbox` using the caller's EntityManager, so
 * the insert participates in the same business transaction as the document
 * + GL mutation it describes (docs/phase-3/02-communication-authentication.md
 * §1.3 — the event exists iff the transaction commits). Dispatching
 * (polling unpublished rows, invoking handlers/BullMQ) is a future worker
 * concern, deliberately not built here.
 */
@Injectable()
export class OutboxWriterService {
  async write<TPayload extends Record<string, unknown>>(
    entityManager: EntityManager,
    event: DomainEvent<TPayload>,
  ): Promise<void> {
    const row = entityManager.create(OutboxEntity, {
      id: generateUuidV7(),
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
      publishedAt: null,
      attempts: 0,
    });

    await entityManager.save(OutboxEntity, row);
  }
}
