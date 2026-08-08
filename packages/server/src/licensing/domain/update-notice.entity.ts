import { Check, Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

export type UpdateNoticeUrgency = "NORMAL" | "SECURITY";
export type UpdateNoticeDecision = "PENDING" | "SCHEDULED" | "APPLIED" | "DECLINED";

/**
 * Maps to `license.update_notice` (docs/phase-4/04-schema-operations.md
 * §7) — Infoney pushes a new-version announcement via `POST
 * /license/v1/update-notice`; the school's admin later records a decision
 * (`PENDING -> SCHEDULED -> APPLIED`, or `PENDING -> DECLINED`).
 * `MutableBaseEntity` per the task's own instruction (decision progresses
 * in place).
 *
 * **Column naming deviation from the docs' literal DDL**: the schema doc
 * names this table's release-version column `version` — but
 * `MutableBaseEntity` already reserves the bare `version` column (an `int`
 * optimistic-lock counter, `@VersionColumn`, the same standard shape every
 * other mutable entity in this codebase uses) on every table it backs. Two
 * physical columns can't share one name, and TypeScript won't allow a
 * subclass to redeclare an inherited property with an incompatible type
 * either. Rather than break the optimistic-lock convention for this one
 * table, the domain concept — "the software release version Infoney is
 * announcing" — gets its own distinctly-named column, `release_version`.
 * The WIRE-level field name stays `version` (`UpdateNoticeInput.version` in
 * `application/license-api.service.ts`/`update-notices.service.ts`, matching
 * FR-LIC-002.1's `update-notice` payload naming) — only this entity's own
 * TypeScript property/column differs, mapped at the service boundary.
 */
@Entity({ name: "update_notice", schema: "license" })
@Check("ck_license_update_notice_urgency", `"urgency" IN ('NORMAL','SECURITY')`)
@Check("ck_license_update_notice_decision", `"decision" IN ('PENDING','SCHEDULED','APPLIED','DECLINED')`)
export class UpdateNoticeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "release_version" })
  releaseVersion!: string;

  @Column({ type: "text", name: "notes" })
  notes!: string;

  @Column({ type: "varchar", length: 10, name: "urgency" })
  urgency!: UpdateNoticeUrgency;

  @Column({ type: "date", name: "mandatory_by", nullable: true })
  mandatoryBy!: string | null;

  @Column({ type: "timestamptz", name: "received_at" })
  receivedAt!: Date;

  @Column({ type: "timestamptz", name: "applied_at", nullable: true })
  appliedAt!: Date | null;

  @Column({ type: "varchar", length: 10, name: "decision", default: "PENDING" })
  decision!: UpdateNoticeDecision;
}
