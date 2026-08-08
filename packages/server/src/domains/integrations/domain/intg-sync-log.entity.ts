import { Check, Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";

export type IntgSyncLogKind = "QUICKBOOKS" | "XERO" | "SAGE";
export const INTG_SYNC_LOG_KINDS: readonly IntgSyncLogKind[] = ["QUICKBOOKS", "XERO", "SAGE"];

/**
 * `direction`/`status` have no CHECK enum spelled out in
 * docs/phase-4/04-schema-operations.md §6 — designed here (documented per
 * that section's own instruction): `direction` mirrors `AccountingSyncPort`'s
 * `pushEntity(kind, direction: 'PUSH', ...)` parameter (`'PULL'` reserved for
 * a future inbound-sync direction, not implemented by any adapter in this
 * pass); `status` is a simple binary outcome, `'SUCCESS'` or `'FAILED'` —
 * there is no in-progress state because `AccountingSyncService.pushEntity()`
 * always logs synchronously, after the adapter call has already settled
 * (log-then-classify, see that service's own doc comment).
 */
export type IntgSyncLogDirection = "PUSH" | "PULL";
export const INTG_SYNC_LOG_DIRECTIONS: readonly IntgSyncLogDirection[] = ["PUSH", "PULL"];

export type IntgSyncLogStatus = "SUCCESS" | "FAILED";
export const INTG_SYNC_LOG_STATUSES: readonly IntgSyncLogStatus[] = ["SUCCESS", "FAILED"];

/**
 * Maps to `intg_sync_log` (docs/phase-4/04-schema-operations.md §6) — Module
 * 19 (Integrations). Append-only audit trail of every accounting-sync push
 * attempt (`BaseEntity`, no `version`/update path — a log entry is written
 * once and never edited, same shape `AuditLogEntity`/`gl_integrity_run`
 * establish for append-only tables).
 *
 * `entity`/`entity_id` identify the domain record being synced (e.g.
 * `entity='INVOICE'`, `entity_id=<bill_invoice.id>`) — deliberately a bare
 * `varchar`/`uuid` pair with NO FK, since this module is DELIBERATELY
 * NARROW (module-deps.json's `domains/integrations` entry) and must not
 * reach into every other domain's tables just to validate a log row's
 * subject; same "loose reference, no FK" treatment `appr_instance`'s
 * `entity_type`/`entity_id` pair and `exp_voucher.approval_ref` already
 * establish elsewhere in this codebase. The TypeORM property is named
 * `entityType` (column `entity`) to avoid shadowing the word "entity" as a
 * bare identifier.
 *
 * `at` is a dedicated business timestamp for "when this sync attempt
 * occurred" — the DDL lists it as its own column distinct from the standard
 * `created_at` `BaseEntity` already provides. In practice the two are
 * identical for every row this pass ever writes (`AccountingSyncService`
 * logs synchronously, immediately after the adapter call settles) but `at`
 * is kept as its own column per the DDL's explicit listing, leaving room for
 * a future backfill/replay path where the business timestamp could
 * legitimately differ from the row's physical insertion time.
 */
@Entity("intg_sync_log")
@Index("ix_intg_sync_log_entity", ["entityType", "entityId"])
@Check("ck_intg_sync_log_kind", `"kind" IN ('QUICKBOOKS','XERO','SAGE')`)
@Check("ck_intg_sync_log_direction", `"direction" IN ('PUSH','PULL')`)
@Check("ck_intg_sync_log_status", `"status" IN ('SUCCESS','FAILED')`)
export class IntgSyncLogEntity extends BaseEntity {
  @Column({ type: "varchar", length: 20, name: "kind" })
  kind!: IntgSyncLogKind;

  @Column({ type: "varchar", length: 4, name: "direction" })
  direction!: IntgSyncLogDirection;

  @Column({ type: "varchar", length: 60, name: "entity" })
  entityType!: string;

  @Column({ type: "uuid", name: "entity_id" })
  entityId!: string;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: IntgSyncLogStatus;

  @Column({ type: "varchar", length: 100, name: "provider_ref", nullable: true })
  providerRef!: string | null;

  @Column({ type: "text", name: "error", nullable: true })
  error!: string | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;
}
