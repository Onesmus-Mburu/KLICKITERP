import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";

export type PayChequeStatus = "UNCLEARED" | "CLEARED" | "BOUNCED";
export const PAY_CHEQUE_STATUSES: readonly PayChequeStatus[] = ["UNCLEARED", "CLEARED", "BOUNCED"];

/**
 * Maps to `pay_cheque` (docs/phase-4/03-schema-student-finance.md §4) —
 * Module 10 (Payments) **foundation pass only** (docs/phase-5/PROGRESS.md).
 * `MutableBaseEntity` — a real post-creation update path: `status`
 * progresses `UNCLEARED -> CLEARED | BOUNCED` (FR-PAY-007.1), with
 * `status_changed_at`/`bounce_fee_applied` populated only at that later
 * clearance/bounce event, independent of and long after the row was first
 * captured as a receipt split reference.
 *
 * No FK from this table to `pay_receipt_split` — the relationship is owned
 * by the split row (`pay_receipt_split.cheque_id -> pay_cheque`), a cheque
 * exists independently of which receipt split(s) reference it.
 */
@Entity("pay_cheque")
@Index("uq_pay_cheque_bank_no_drawer", ["bankName", "chequeNo", "drawer"], { unique: true })
@Check("ck_pay_cheque_status", `"status" IN ('UNCLEARED','CLEARED','BOUNCED')`)
@Check("ck_pay_cheque_amount_positive", `"amount" > 0`)
export class PayChequeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "bank_name" })
  bankName!: string;

  @Column({ type: "varchar", length: 30, name: "cheque_no" })
  chequeNo!: string;

  @Column({ type: "date", name: "cheque_date" })
  chequeDate!: string;

  @Column({ type: "varchar", length: 120, name: "drawer" })
  drawer!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: PayChequeStatus;

  @Column({ type: "timestamptz", name: "status_changed_at", nullable: true })
  statusChangedAt!: Date | null;

  @Column({ type: "boolean", name: "bounce_fee_applied", default: false })
  bounceFeeApplied!: boolean;
}
