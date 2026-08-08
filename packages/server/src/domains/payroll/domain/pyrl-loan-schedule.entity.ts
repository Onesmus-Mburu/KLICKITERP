import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlLoanEntity } from "./pyrl-loan.entity";

/**
 * Maps to `pyrl_loan_schedule` (docs/phase-4/04-schema-operations.md §4) —
 * one amortization installment of a `pyrl_loan` (FR-PYRL-004.1: "schedule
 * generated; per-run recovery auto-inserted; early settlement
 * recalculates"). Module 15 (Payroll) **foundation pass only**
 * (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — `recovered_amount` genuinely increments IN PLACE
 * per payroll run recovery (the task brief's own justification), rather
 * than each recovery being a new row.
 *
 * `loan_id` -> `pyrl_loan` is CASCADE — a true owned child, the schedule
 * has no meaning outside its parent loan.
 *
 * `due_period` mirrors `pyrl_run.period_key`'s `'YYYY-MM'` shape
 * (`varchar(7)`, e.g. `'2026-07'`) — the period this installment is due in.
 */
@Entity("pyrl_loan_schedule")
export class PyrlLoanScheduleEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "loan_id" })
  loanId!: string;

  @ManyToOne(() => PyrlLoanEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "loan_id" })
  loan?: PyrlLoanEntity;

  @Column({ type: "int", name: "seq" })
  seq!: number;

  @Column({ type: "varchar", length: 7, name: "due_period" })
  duePeriod!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "principal_due",
    transformer: RequiredMoneyTransformer,
  })
  principalDue!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "interest_due",
    transformer: RequiredMoneyTransformer,
  })
  interestDue!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "recovered_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  recoveredAmount!: Money;
}
