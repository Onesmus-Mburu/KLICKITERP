import { Check, Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";

export type ApiCallDirection = "IN" | "OUT";

/**
 * Maps to `license.api_call_log` (docs/phase-4/04-schema-operations.md §7) —
 * BR-LIC-04: "every licensing API call (inbound and outbound) is logged
 * school-visibly with full request/response bodies." `BaseEntity` per the
 * task's own instruction (append-only log, using the standard base shape
 * rather than a hand-trimmed column set like `AuditLogEntity`'s) — only
 * `createdAt`/`createdBy` are ever meaningfully populated;
 * `updatedAt`/`updatedBy` stay at their insert-time defaults since a log row
 * is never mutated. One row per direction per call (`ApiCallLoggerService`
 * writes an `IN` row when a request is verified, then an `OUT` row once the
 * response is signed) — see that service's own doc comment.
 */
@Entity({ name: "api_call_log", schema: "license" })
@Check("ck_license_api_call_log_direction", `"direction" IN ('IN','OUT')`)
@Index("ix_license_api_call_log_at", ["at"])
export class ApiCallLogEntity extends BaseEntity {
  @Column({ type: "varchar", length: 3, name: "direction" })
  direction!: ApiCallDirection;

  @Column({ type: "varchar", length: 60, name: "endpoint" })
  endpoint!: string;

  @Column({ type: "jsonb", name: "request_body", nullable: true })
  requestBody!: unknown | null;

  @Column({ type: "jsonb", name: "response_body", nullable: true })
  responseBody!: unknown | null;

  /** The JWS `kid` header of whichever key signed this call's request (IN) or this response (OUT). */
  @Column({ type: "varchar", length: 40, name: "caller_key_id", nullable: true })
  callerKeyId!: string | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;
}
