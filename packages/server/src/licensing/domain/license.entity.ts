import { Check, Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

export type LicenseState = "PROVISIONED" | "ACTIVE" | "GRACE" | "SUSPENDED" | "DEACTIVATED" | "EXPIRED";
export const LICENSE_STATES: readonly LicenseState[] = [
  "PROVISIONED",
  "ACTIVE",
  "GRACE",
  "SUSPENDED",
  "DEACTIVATED",
  "EXPIRED",
];

/**
 * Maps to `license.license` (docs/phase-4/04-schema-operations.md §7) —
 * Module 21 (Licensing), the structurally-isolated module. `MutableBaseEntity`
 * (state progresses in place, per the task's own instruction) even though
 * `shared/database`'s base classes are the ONE thing this module is allowed
 * to import (module-deps.json `"licensing": {"mayImport": ["shared"]}`).
 *
 * One row per instance in practice — this is a single-school on-prem/hosted
 * deployment, not a multi-tenant table (`school_id` identifies which school
 * THIS instance's one license row belongs to, not a partitioning key across
 * many rows). `LicenseRepository.findCurrent()` reads the most-recently-created
 * row, the same "most recent wins" convention `license.v_state`
 * (migration `0190`) uses at the DB level.
 */
@Entity({ name: "license", schema: "license" })
@Check("ck_license_state", `"state" IN ('PROVISIONED','ACTIVE','GRACE','SUSPENDED','DEACTIVATED','EXPIRED')`)
export class LicenseEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "school_id" })
  schoolId!: string;

  @Column({ type: "varchar", length: 30, name: "plan" })
  plan!: string;

  @Column({ type: "jsonb", name: "features", default: () => "'[]'" })
  features!: string[];

  @Column({ type: "date", name: "valid_from" })
  validFrom!: string;

  @Column({ type: "date", name: "valid_to" })
  validTo!: string;

  @Column({ type: "int", name: "grace_days", default: 14 })
  graceDays!: number;

  @Column({ type: "varchar", length: 12, name: "state", default: "PROVISIONED" })
  state!: LicenseState;

  /** The signed JWS/JSON envelope exactly as received (FR-LIC-001.1) — kept verbatim for audit/re-verification. */
  @Column({ type: "text", name: "license_blob", nullable: true })
  licenseBlob!: string | null;

  @Column({ type: "timestamptz", name: "verified_at", nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: "timestamptz", name: "state_changed_at", nullable: true })
  stateChangedAt!: Date | null;
}
