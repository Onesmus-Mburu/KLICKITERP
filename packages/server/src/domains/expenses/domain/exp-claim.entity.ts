import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../../platform/users";

/**
 * **Status-enum design decision** (the DDL only says "status incl.
 * REIMBURSED" — beyond that, unspecified): `DRAFT|PENDING_APPROVAL|APPROVED|
 * REIMBURSED|REJECTED|CANCELLED`. Rationale: mirrors `exp_voucher`'s
 * DRAFT->PENDING_APPROVAL->APPROVED workflow shape exactly (a staff claim is
 * hand-authored line-by-line while `DRAFT`, same as a voucher), but swaps
 * `PAID` for `REIMBURSED` (the DDL's own required terminal value, semantically
 * identical to a payment terminal state, just claim-domain-specific naming)
 * and adds `REJECTED` — distinct from `CANCELLED` because a staff claim can
 * be turned down by an approver on its merits (a normal approval-chain
 * outcome, `ApprovalEngineService`'s own `decide()` vocabulary already
 * distinguishes reject from withdraw) whereas `CANCELLED` is the claimant
 * withdrawing it themselves pre-decision — the same reject/cancel split
 * `ProcRequisitionEntity`'s own `REJECTED`/`CANCELLED` pair already
 * establishes in this codebase. Documented per the task brief's own
 * instruction to design and document this enum.
 */
export type ExpClaimStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REIMBURSED" | "REJECTED" | "CANCELLED";
export const EXP_CLAIM_STATUSES: readonly ExpClaimStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REIMBURSED",
  "REJECTED",
  "CANCELLED",
];

export type ExpClaimReimburseVia = "PAYROLL" | "DIRECT";
export const EXP_CLAIM_REIMBURSE_VIA: readonly ExpClaimReimburseVia[] = ["PAYROLL", "DIRECT"];

/**
 * Maps to `exp_claim` (docs/phase-4/04-schema-operations.md §4) — a staff
 * out-of-pocket expense claim, header only (see `ExpClaimLineEntity` for the
 * DDL's inline "lines child"). Module 14 (Expenses) **foundation pass
 * only**.
 *
 * `MutableBaseEntity` — real status progression through the full
 * DRAFT->PENDING_APPROVAL->APPROVED->REIMBURSED (or ->REJECTED/->CANCELLED)
 * lifecycle (see the status-enum design decision above), and `total` is
 * recomputed as lines are added/removed while still `DRAFT` — the exact same
 * "cached running total, recomputed pre-submission" shape
 * `ProcRequisitionEntity.totalEstimate` established.
 *
 * `staff_user_id` is a required FK to `usr_user` (`platform/users`, imported
 * via its index.ts barrel). `reimburse_via` is NOT NULL — the DDL's own
 * `CK(PAYROLL|DIRECT)` gives no NULL option, and a claimant is expected to
 * choose their reimbursement route at claim-creation time (a design
 * judgement call: unlike `payee_ref`, this is a plain two-value enum with no
 * natural "not yet decided" default). `approval_ref` stays a loose `uuid`
 * with no FK — same reasoning `ExpVoucherEntity.approvalRef`'s doc comment
 * gives.
 */
@Entity("exp_claim")
@Index("uq_exp_claim_number", ["number"], { unique: true })
@Check(
  "ck_exp_claim_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','REIMBURSED','REJECTED','CANCELLED')`,
)
@Check("ck_exp_claim_reimburse_via", `"reimburse_via" IN ('PAYROLL','DIRECT')`)
@Check("ck_exp_claim_total_nonneg", `"total" >= 0`)
export class ExpClaimEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "staff_user_id" })
  staffUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "staff_user_id" })
  staff?: UsrUserEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: ExpClaimStatus;

  @Column({ type: "varchar", length: 10, name: "reimburse_via" })
  reimburseVia!: ExpClaimReimburseVia;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;
}
