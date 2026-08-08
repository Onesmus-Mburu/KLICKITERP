import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../database/base.entity";

/**
 * Maps to `obx_consumer_mark` (docs/phase-4/02-schema-platform-accounting.md
 * §6) — shared-kernel outbox infrastructure, deliberately placed beside
 * `shared/events/outbox.entity.ts` rather than inside any one domain module:
 * it is the dedup ledger a future outbox *dispatcher/worker* consults before
 * invoking a consumer's handler for a given `obx_outbox` row a second time
 * (`uq(consumer, event_id)` is the idempotency guarantee itself — a handler
 * checks/inserts this row in the same transaction as its own side effect,
 * and a unique-violation means "already processed, skip").
 *
 * `BaseEntity` (not `MutableBaseEntity`) — per this module's task brief, a
 * consumer mark is never updated in place, only ever inserted once per
 * `(consumer, event_id)` pair; `BaseEntity`'s `created_at` already gives this
 * table the one timestamp an idempotency ledger needs (when the mark was
 * written), so no bespoke minimal shape is warranted over the standard base.
 *
 * No repository/service exists yet — no outbox dispatcher/worker app has
 * been built in this codebase (see `OutboxWriterService`'s doc comment,
 * "Dispatching ... is a future worker concern"). This entity is registered
 * in `data-source.ts` and has its own migration so the table exists ahead of
 * that worker's arrival.
 */
@Entity("obx_consumer_mark")
@Index("uq_obx_consumer_mark_consumer_event_id", ["consumer", "eventId"], { unique: true })
export class OutboxConsumerMarkEntity extends BaseEntity {
  @Column({ type: "varchar", length: 60, name: "consumer" })
  consumer!: string;

  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
}
