import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrRoleEntity } from "../../users/domain/usr-role.entity";
import { ApprWorkflowVersionEntity } from "./appr-workflow-version.entity";

export type ApprLevelApproverType = "ROLE" | "USERS" | "DEPT_HEAD";
export const APPR_LEVEL_APPROVER_TYPES: readonly ApprLevelApproverType[] = ["ROLE", "USERS", "DEPT_HEAD"];

export type ApprLevelMode = "SEQUENTIAL" | "PARALLEL";
export const APPR_LEVEL_MODES: readonly ApprLevelMode[] = ["SEQUENTIAL", "PARALLEL"];

/**
 * Maps to `appr_level` (docs/phase-4/02-schema-platform-accounting.md §6).
 * `seq` is the level's position within its `workflow_version_id` (1-based,
 * ascending) — `ApprovalEngineService` walks levels in `seq` order, filtered
 * to whatever `level_subset` a matching `appr_routing_rule` selected (or all
 * levels when none matched). `user_ids`/`escalation` use TypeORM's Postgres
 * array/jsonb column options directly (`{ type: 'uuid', array: true }`);
 * `sla_hours`/`escalation` are stored but not yet acted on — no scheduler/
 * worker exists in this codebase to fire SLA reminders or escalations
 * (FR-APPR-005.1), same "config exists, dispatcher doesn't yet" pattern as
 * `comm_trigger_binding` in Module 5.
 */
@Entity("appr_level")
@Index("uq_appr_level_version_seq", ["workflowVersionId", "seq"], { unique: true })
@Check("ck_appr_level_approver_type", `"approver_type" IN ('ROLE','USERS','DEPT_HEAD')`)
@Check("ck_appr_level_mode", `"mode" IN ('SEQUENTIAL','PARALLEL')`)
export class ApprLevelEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "workflow_version_id" })
  workflowVersionId!: string;

  @ManyToOne(() => ApprWorkflowVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workflow_version_id" })
  workflowVersion?: ApprWorkflowVersionEntity;

  @Column({ type: "int", name: "seq" })
  seq!: number;

  @Column({ type: "varchar", length: 20, name: "approver_type" })
  approverType!: ApprLevelApproverType;

  @Column({ type: "uuid", name: "role_id", nullable: true })
  roleId!: string | null;

  @ManyToOne(() => UsrRoleEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "role_id" })
  role?: UsrRoleEntity | null;

  @Column({ type: "uuid", name: "user_ids", array: true, nullable: true })
  userIds!: string[] | null;

  @Column({ type: "varchar", length: 10, name: "mode" })
  mode!: ApprLevelMode;

  @Column({ type: "int", name: "quorum", default: 1 })
  quorum!: number;

  @Column({ type: "int", name: "sla_hours", nullable: true })
  slaHours!: number | null;

  @Column({ type: "jsonb", name: "escalation", nullable: true })
  escalation!: Record<string, unknown> | null;
}
