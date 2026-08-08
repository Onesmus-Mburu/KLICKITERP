import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";
import { ApprInstanceEntity } from "./appr-instance.entity";

export type ApprActionDecision = "APPROVE" | "REJECT" | "RETURN";

/**
 * Maps to `appr_action` (docs/phase-4/02-schema-platform-accounting.md §6)
 * — the append-only decision log for an `appr_instance` (FR-APPR-003: "every
 * decision is timestamped, commented, and audit-logged; the full decision
 * trail SHALL be visible on the document"). `BaseEntity` (not
 * `MutableBaseEntity`) — a recorded decision is never edited or versioned,
 * per this module's task brief.
 *
 * `was_delegated_from` records the *original* legitimate approver when the
 * actual `actor_id` acted as their resolved delegate
 * (`DelegationsService.resolveEffectiveApprover`) — BR-APPR-01/FR-APPR-005.1.
 * `trg_appr_no_self_approval` (migration `0050`) rejects any INSERT here
 * where `actor_id` equals the parent instance's `initiator_id` at the DB
 * layer; `ApprovalEngineService.decide()` checks the same rule at the
 * service layer first (defense-in-depth, G-04's three-layer rule).
 */
@Entity("appr_action")
@Index("ix_appr_action_instance_id", ["instanceId"])
@Check("ck_appr_action_decision", `"decision" IN ('APPROVE','REJECT','RETURN')`)
export class ApprActionEntity extends BaseEntity {
  @Column({ type: "uuid", name: "instance_id" })
  instanceId!: string;

  @ManyToOne(() => ApprInstanceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "instance_id" })
  instance?: ApprInstanceEntity;

  @Column({ type: "int", name: "level_seq" })
  levelSeq!: number;

  @Column({ type: "uuid", name: "actor_id" })
  actorId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id" })
  actor?: UsrUserEntity;

  @Column({ type: "varchar", length: 10, name: "decision" })
  decision!: ApprActionDecision;

  @Column({ type: "text", name: "comment", nullable: true })
  comment!: string | null;

  @Column({ type: "timestamptz", name: "acted_at" })
  actedAt!: Date;

  @Column({ type: "uuid", name: "was_delegated_from", nullable: true })
  wasDelegatedFrom!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "was_delegated_from" })
  delegatedFromUser?: UsrUserEntity | null;
}
