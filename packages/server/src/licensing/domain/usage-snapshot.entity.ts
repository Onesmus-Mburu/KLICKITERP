import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";

/** The EXACT FR-LIC-005.1 `GET usage` payload shape — BR-LIC-03: no more, no fewer fields, ever. */
export interface UsagePayload {
  version: string;
  uptime_s: number;
  active_users_30d: number;
  student_count: number;
  storage_bytes: number;
  last_backup_at: string | null;
  license_state: string;
}

/**
 * Maps to `license.usage_snapshot` (docs/phase-4/04-schema-operations.md
 * §7) — one row per `GET /license/v1/usage` call, `BaseEntity` per the
 * task's own instruction (append-only log). `payload` is stored verbatim as
 * returned to the caller, so a school-visible history of exactly what usage
 * figures were ever reported exists (BR-LIC-03/BR-LIC-04).
 */
@Entity({ name: "usage_snapshot", schema: "license" })
@Index("ix_license_usage_snapshot_at", ["at"])
export class UsageSnapshotEntity extends BaseEntity {
  @Column({ type: "timestamptz", name: "at" })
  at!: Date;

  @Column({ type: "jsonb", name: "payload" })
  payload!: UsagePayload;
}
