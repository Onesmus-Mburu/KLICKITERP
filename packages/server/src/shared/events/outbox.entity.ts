import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from "typeorm";
import { generateUuidV7 } from "../ids/uuid7";

/**
 * Maps to `obx_outbox` (docs/phase-4/02-schema-platform-accounting.md §6):
 * id UUID PK, seq bigint (Postgres `GENERATED ALWAYS AS IDENTITY`), aggregate_type,
 * aggregate_id, event_type, payload jsonb, occurred_at, published_at nullable.
 * `generated: "increment"` below only tells TypeORM to omit `seq` from
 * INSERT statements and read the DB-assigned value back — the concrete
 * `GENERATED ALWAYS AS IDENTITY` DDL is declared explicitly with raw SQL in
 * the migration (TypeORM's decorator has no option for the Postgres
 * identity-column clause itself).
 *
 * `attempts` is an addition beyond the documented DDL: the outbox dispatcher
 * (docs/phase-3/02-communication-authentication.md §1.3, "handler failures
 * retry independently") needs somewhere to record retry count per row: it is
 * additive and does not conflict with the documented columns.
 *
 * Append-only by design (rows are written once, later stamped with
 * `published_at`) — no `updated_by`/`created_by`, matching the same
 * exception the schema doc grants `usr_login_event` ("append-only, no
 * std-update").
 */
@Entity("obx_outbox")
@Index("ix_obx_unpublished_p", ["publishedAt"], { where: '"published_at" IS NULL' })
export class OutboxEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "bigint", name: "seq", unique: true, generated: "increment" })
  seq!: string;

  @Column({ type: "varchar", length: 60, name: "aggregate_type" })
  aggregateType!: string;

  @Column({ type: "uuid", name: "aggregate_id" })
  aggregateId!: string;

  @Column({ type: "varchar", length: 60, name: "event_type" })
  eventType!: string;

  @Column({ type: "jsonb", name: "payload" })
  payload!: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "occurred_at" })
  occurredAt!: Date;

  @Column({ type: "timestamptz", name: "published_at", nullable: true })
  publishedAt!: Date | null;

  @Column({ type: "int", name: "attempts", default: 0 })
  attempts!: number;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
