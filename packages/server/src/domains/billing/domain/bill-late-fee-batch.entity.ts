import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { BillLateFeePolicyEntity } from "./bill-late-fee-policy.entity";

export type BillLateFeeBatchStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED";
export const BILL_LATE_FEE_BATCH_STATUSES: readonly BillLateFeeBatchStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "POSTED",
];

/**
 * Maps to `bill_late_fee_batch` (docs/phase-4/03-schema-student-finance.md
 * §3) — one run of a `bill_late_fee_policy` across the affected population.
 * `MutableBaseEntity` — a real post-creation update path: `status`
 * progresses `DRAFT -> PENDING_APPROVAL -> POSTED` (only when
 * `bill_late_fee_policy.requires_approval`), with `approval_ref`/`summary`
 * populated/refined as the run proceeds.
 *
 * `summary` (jsonb) is the run's result bag (counts, total assessed,
 * per-student breakdown) — opaque to this foundation pass, written by the
 * next pass's late-fee calculation service.
 */
@Entity("bill_late_fee_batch")
@Check("ck_bill_late_fee_batch_status", `"status" IN ('DRAFT','PENDING_APPROVAL','POSTED')`)
export class BillLateFeeBatchEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "policy_id" })
  policyId!: string;

  @ManyToOne(() => BillLateFeePolicyEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "policy_id" })
  policy?: BillLateFeePolicyEntity;

  @Column({ type: "date", name: "run_date" })
  runDate!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: BillLateFeeBatchStatus;

  /** Loose uuid, no FK — `platform/approvals` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "jsonb", name: "summary", default: {} })
  summary!: Record<string, unknown>;
}
