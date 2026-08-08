import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from "typeorm";
import { generateUuidV7 } from "../ids/uuid7";

/**
 * Maps to `audit.audit_log` (docs/phase-4/02-schema-platform-accounting.md §3).
 * INSERT-only for the `kfe_app` role at the DB (UPDATE/DELETE revoked in
 * migration 0020) — tamper evidence comes from that grant plus the
 * prev_hash/hash chain (FR-AUD-002), computed by `computeHash()` in
 * `audit-hash.util.ts`. Append-only: no updated_at/updated_by, matching the
 * schema doc's std-column exception pattern for append-only tables.
 *
 * `seq` is a Postgres `GENERATED ALWAYS AS IDENTITY` column (chain order) —
 * declared via raw SQL in migration 0020; `generated: "increment"` here only
 * tells TypeORM to omit it from INSERTs and read the DB-assigned value back.
 */
@Entity({ name: "audit_log", schema: "audit" })
@Index("ix_audit_entity", ["entityType", "entityId", "at"])
@Index("ix_audit_actor_at", ["actorId", "at"])
export class AuditLogEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "bigint", name: "seq", unique: true, generated: "increment" })
  seq!: string;

  @Column({ type: "uuid", name: "actor_id", nullable: true })
  actorId!: string | null;

  @Column({ type: "varchar", length: 80, name: "actor_label" })
  actorLabel!: string;

  @Column({ type: "varchar", length: 60, name: "entity_type" })
  entityType!: string;

  @Column({ type: "uuid", name: "entity_id" })
  entityId!: string;

  @Column({ type: "varchar", length: 30, name: "action" })
  action!: string;

  @Column({ type: "jsonb", name: "before", nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: "jsonb", name: "after", nullable: true })
  after!: Record<string, unknown> | null;

  @Column({ type: "inet", name: "ip", nullable: true })
  ip!: string | null;

  @Column({ type: "uuid", name: "session_id", nullable: true })
  sessionId!: string | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;

  @Column({ type: "varchar", length: 64, name: "prev_hash", nullable: true })
  prevHash!: string | null;

  @Column({ type: "varchar", length: 64, name: "hash" })
  hash!: string;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) {
      this.id = generateUuidV7();
    }
  }
}
