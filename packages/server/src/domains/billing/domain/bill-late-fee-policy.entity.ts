import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type BillLateFeeMode = "FLAT" | "PERCENT" | "TIERED";
export const BILL_LATE_FEE_MODES: readonly BillLateFeeMode[] = ["FLAT", "PERCENT", "TIERED"];

/**
 * Maps to `bill_late_fee_policy` (docs/phase-4/03-schema-student-finance.md
 * §3) — a named late-fee calculation policy. `MutableBaseEntity` — ordinary
 * mutable config.
 *
 * `params` (jsonb) is the mode-specific parameter bag (flat amount / percent
 * rate / tier breakpoints) — opaque to this foundation pass, interpreted by
 * the next pass's late-fee calculation service (BR-BILL-10/BR-BILL-11).
 */
@Entity("bill_late_fee_policy")
@Index("uq_bill_late_fee_policy_name", ["name"], { unique: true })
@Check("ck_bill_late_fee_policy_mode", `"mode" IN ('FLAT','PERCENT','TIERED')`)
export class BillLateFeePolicyEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 10, name: "mode" })
  mode!: BillLateFeeMode;

  @Column({ type: "jsonb", name: "params", default: {} })
  params!: Record<string, unknown>;

  @Column({ type: "int", name: "grace_days", default: 0 })
  graceDays!: number;

  @Column({ type: "boolean", name: "requires_approval", default: false })
  requiresApproval!: boolean;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
