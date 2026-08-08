import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer, RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../../platform/users";

export type PayCashierSessionStatus = "OPEN" | "CLOSED";
export const PAY_CASHIER_SESSION_STATUSES: readonly PayCashierSessionStatus[] = ["OPEN", "CLOSED"];

/**
 * Maps to `pay_cashier_session` (docs/phase-4/03-schema-student-finance.md
 * §4) — Module 10 (Payments) **foundation pass only**: entities/
 * repositories/migration/triggers (docs/phase-5/PROGRESS.md). Application
 * services (open/close session workflow, variance handling, supervisor
 * override) land in a later pass.
 *
 * `MutableBaseEntity` — an unambiguous genuine post-creation update path:
 * `status` flips `OPEN -> CLOSED` at close time, and `closed_at`/`counted`/
 * `expected_totals`/`variance_amount`/`variance_reason`/`supervisor_id` are
 * all populated only then (FR-PAY-011.1), long after the row was created at
 * session-open time with just `cashier_id`/`till`/`float_amount`.
 *
 * `uq_pay_session_open_p` (BR-PAY-04 — "cash receipts can only be captured
 * within an OPEN cashier session belonging to the capturing cashier") is a
 * partial unique index on `cashier_id` `WHERE status='OPEN'`, enforcing "at
 * most one OPEN session per cashier at a time" at the DB layer — expressible
 * directly via `@Index`'s `where` option, no raw SQL needed.
 */
@Entity("pay_cashier_session")
@Index("uq_pay_session_open_p", ["cashierId"], { unique: true, where: `"status" = 'OPEN'` })
@Check("ck_pay_cashier_session_status", `"status" IN ('OPEN','CLOSED')`)
export class PayCashierSessionEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "cashier_id" })
  cashierId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "cashier_id" })
  cashier?: UsrUserEntity;

  @Column({ type: "varchar", length: 30, name: "till" })
  till!: string;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: PayCashierSessionStatus;

  @Column({ type: "timestamptz", name: "opened_at" })
  openedAt!: Date;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "float_amount",
    transformer: RequiredMoneyTransformer,
  })
  floatAmount!: Money;

  @Column({ type: "timestamptz", name: "closed_at", nullable: true })
  closedAt!: Date | null;

  /** Denomination breakdown captured at close time — opaque to this foundation pass. */
  @Column({ type: "jsonb", name: "counted", nullable: true })
  counted!: Record<string, unknown> | null;

  @Column({ type: "jsonb", name: "expected_totals", nullable: true })
  expectedTotals!: Record<string, unknown> | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "variance_amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  varianceAmount!: Money | null;

  @Column({ type: "text", name: "variance_reason", nullable: true })
  varianceReason!: string | null;

  @Column({ type: "uuid", name: "supervisor_id", nullable: true })
  supervisorId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "supervisor_id" })
  supervisor?: UsrUserEntity | null;
}
