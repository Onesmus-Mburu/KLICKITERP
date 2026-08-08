import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";
import { ApprWorkflowVersionEntity } from "./appr-workflow-version.entity";

export type ApprInstanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";

/**
 * Maps to `appr_instance` (docs/phase-4/02-schema-platform-accounting.md
 * §6) — the generic approval-workflow attachment point any domain module
 * creates via `ApprovalEngineService.submit()` (FR-APPR-007.1: "domains
 * verify `approval_ref` before posting"). `(entity_type, entity_id)`
 * identifies the domain document (e.g. `('BILLING_WAIVER', waiverId)`);
 * `uq_appr_instance_open_p` is a partial unique index enforcing "at most one
 * PENDING instance per entity" — `ApprovalEngineService.submit()` relies on
 * this constraint firing (caught as a Postgres unique-violation, rethrown as
 * `ConflictException`) rather than a check-then-insert race.
 *
 * `current_level` is an `appr_level.seq` value (not a level id) — it is
 * meaningful only relative to the `level_subset` this instance's matching
 * `appr_routing_rule` resolved at submission time (BR-APPR-02: routing uses
 * the document's total *at submission*; re-derived deterministically from
 * `amount`/`initiator_id` at decision time by `ApprovalEngineService` rather
 * than persisted as its own column, since the DDL has none for it — see
 * that service's doc comment).
 */
@Entity("appr_instance")
@Index("ix_appr_instance_pending_p", ["currentLevel"], { where: `"status" = 'PENDING'` })
@Index("ix_appr_instance_entity", ["entityType", "entityId"])
@Index("uq_appr_instance_open_p", ["entityType", "entityId"], { unique: true, where: `"status" = 'PENDING'` })
@Check("ck_appr_instance_status", `"status" IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED')`)
export class ApprInstanceEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "workflow_version_id" })
  workflowVersionId!: string;

  @ManyToOne(() => ApprWorkflowVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workflow_version_id" })
  workflowVersion?: ApprWorkflowVersionEntity;

  @Column({ type: "varchar", length: 30, name: "domain_code" })
  domainCode!: string;

  @Column({ type: "varchar", length: 60, name: "entity_type" })
  entityType!: string;

  @Column({ type: "uuid", name: "entity_id" })
  entityId!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  amount!: Money | null;

  @Column({ type: "uuid", name: "initiator_id" })
  initiatorId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "initiator_id" })
  initiator?: UsrUserEntity;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ApprInstanceStatus;

  @Column({ type: "int", name: "current_level" })
  currentLevel!: number;

  @Column({ type: "timestamptz", name: "submitted_at" })
  submittedAt!: Date;

  @Column({ type: "timestamptz", name: "decided_at", nullable: true })
  decidedAt!: Date | null;
}
