import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity, UsrDepartmentEntity } from "../../../platform/users";

export type ProcRequisitionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "CANCELLED";
export const PROC_REQUISITION_STATUSES: readonly ProcRequisitionStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CONVERTED",
  "CANCELLED",
];

/**
 * Maps to `proc_requisition` (docs/phase-4/04-schema-operations.md §2) — a
 * staff purchase requisition. Module 12 (Procurement) **foundation pass
 * only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — genuine status progression through the full
 * DRAFT->...->CONVERTED/CANCELLED lifecycle (BR-PROC-01), and
 * `total_estimate` is recomputed as lines are added/removed pre-submission.
 *
 * `budget_snapshot` (jsonb) is nullable — a deliberate deviation from a
 * strict "no NULL marker in the DDL means NOT NULL" reading: FR-PROC-002.1
 * says "submission snapshots budget availability", i.e. it can only be
 * populated once the requisition is actually submitted, not at DRAFT
 * creation time, so it must start NULL.
 *
 * `approval_ref` is a loose `uuid` with no FK — `platform/approvals` is
 * deliberately not in this foundation pass's `mayImport` list (same
 * foundation-pass-stage judgement call `pay_receipt.approval_ref`/
 * `bill_invoice.approval_ref` made); the next pass's services will call
 * `ApprovalEngineService` directly.
 *
 * `item_id`/`budget_line_id` on the child `proc_requisition_line` are the
 * module's two documented forward-reference/cross-module-FK points — see
 * that entity's own doc comment.
 */
@Entity("proc_requisition")
@Index("uq_proc_requisition_number", ["number"], { unique: true })
@Check(
  "ck_proc_requisition_status",
  `"status" IN ('DRAFT','SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED','CONVERTED','CANCELLED')`,
)
export class ProcRequisitionEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "requested_by" })
  requestedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "requested_by" })
  requester?: UsrUserEntity;

  @Column({ type: "uuid", name: "department_id" })
  departmentId!: string;

  @ManyToOne(() => UsrDepartmentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "department_id" })
  department?: UsrDepartmentEntity;

  @Column({ type: "text", name: "justification" })
  justification!: string;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: ProcRequisitionStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  /** Populated at submission only — see class doc comment. */
  @Column({ type: "jsonb", name: "budget_snapshot", nullable: true })
  budgetSnapshot!: Record<string, unknown> | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total_estimate",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  totalEstimate!: Money;
}
