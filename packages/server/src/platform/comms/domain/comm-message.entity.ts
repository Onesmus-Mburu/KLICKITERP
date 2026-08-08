import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { CommBroadcastEntity } from "./comm-broadcast.entity";
import { CommChannel } from "./comm-template.entity";

export type CommMessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "OPTED_OUT";

/**
 * Maps to `comm_message` (docs/phase-4/02-schema-platform-accounting.md §5)
 * — the append-mostly send log (high volume). `NotificationsService.send()`
 * inserts a row with `status='QUEUED'` first, then flips it to
 * `SENT`/`FAILED`/`OPTED_OUT` in place — the only "update" this table ever
 * sees, hence `BaseEntity` (not `MutableBaseEntity`): the DDL as written has
 * no `version` column, matching `FileObjectEntity`'s precedent for a table
 * with a narrow, single-purpose write-after-insert pattern rather than
 * free-form multi-field edits needing optimistic locking. `updated_at`/
 * `updated_by` (inherited from `BaseEntity`) are a harmless superset of the
 * DDL, same as that precedent.
 *
 * `broadcast_id` FKs to `comm_broadcast` (RESTRICT — the doc's default FK
 * mode when no override is noted); populated only for messages expanded
 * from a broadcast send (`BroadcastsService.send()`), null for point-to-
 * point sends via `NotificationsService.send()` directly.
 *
 * Partial index `ix_comm_message_status_p` (`status IN ('QUEUED','FAILED')`)
 * is what a future retry/requeue sweep would scan; `BRIN(queued_at)` is
 * declared via raw SQL in the migration (TypeORM has no BRIN index type) —
 * this entity only owns the `queuedAt` column shape.
 */
@Entity("comm_message")
@Index("ix_comm_message_status_p", ["status"], { where: `"status" IN ('QUEUED','FAILED')` })
@Index("ix_comm_message_entity", ["entityType", "entityId"])
@Check("ck_comm_message_channel", `"channel" IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')`)
@Check("ck_comm_message_status", `"status" IN ('QUEUED','SENT','DELIVERED','FAILED','OPTED_OUT')`)
export class CommMessageEntity extends BaseEntity {
  @Column({ type: "varchar", length: 10, name: "channel" })
  channel!: CommChannel;

  @Column({ type: "varchar", length: 160, name: "recipient" })
  recipient!: string;

  @Column({ type: "varchar", length: 50, name: "template_event", nullable: true })
  templateEvent!: string | null;

  @Column({ type: "uuid", name: "broadcast_id", nullable: true })
  broadcastId!: string | null;

  @ManyToOne(() => CommBroadcastEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "broadcast_id" })
  broadcast?: CommBroadcastEntity | null;

  @Column({ type: "varchar", length: 60, name: "entity_type", nullable: true })
  entityType!: string | null;

  @Column({ type: "uuid", name: "entity_id", nullable: true })
  entityId!: string | null;

  @Column({ type: "text", name: "body_rendered" })
  bodyRendered!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: CommMessageStatus;

  @Column({ type: "varchar", length: 40, name: "provider", nullable: true })
  provider!: string | null;

  @Column({ type: "varchar", length: 80, name: "provider_ref", nullable: true })
  providerRef!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "cost_amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  costAmount!: Money | null;

  @Column({ type: "int", name: "segments", nullable: true })
  segments!: number | null;

  @Column({ type: "text", name: "error", nullable: true })
  error!: string | null;

  @Column({ type: "timestamptz", name: "queued_at" })
  queuedAt!: Date;

  @Column({ type: "timestamptz", name: "sent_at", nullable: true })
  sentAt!: Date | null;

  @Column({ type: "timestamptz", name: "delivered_at", nullable: true })
  deliveredAt!: Date | null;
}
