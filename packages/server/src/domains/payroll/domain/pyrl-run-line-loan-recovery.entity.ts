import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlRunLineEntity } from "./pyrl-run-line.entity";
import { PyrlLoanEntity } from "./pyrl-loan.entity";

/**
 * Maps to `pyrl_run_line_loan_recovery` (migration `0242`) — the per-loan
 * breakdown behind a `pyrl_run_line`'s own aggregate `loan_recovered`/
 * `deferred_recovery` scalars, one row per (run_line, loan) that had an
 * installment due this period. See that migration's own doc comment for
 * the full "Option B" design (2026-08-21 user decision) this closes.
 *
 * **`BaseEntity`** — same reasoning as `PyrlRunLineComponentEntity` (its
 * closest sibling): computed once by `PayrollRunsService.compute()`
 * alongside the parent line, never updated in place afterward.
 *
 * `run_line_id` -> `pyrl_run_line` is CASCADE (owned child). `loan_id` ->
 * `pyrl_loan` is RESTRICT (a real, independently-referenced loan record,
 * the same RESTRICT `pyrl_run_line_component.component_id` already uses
 * for its own shared-catalogue reference).
 */
@Entity("pyrl_run_line_loan_recovery")
export class PyrlRunLineLoanRecoveryEntity extends BaseEntity {
  @Column({ type: "uuid", name: "run_line_id" })
  runLineId!: string;

  @ManyToOne(() => PyrlRunLineEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_line_id" })
  runLine?: PyrlRunLineEntity;

  @Column({ type: "uuid", name: "loan_id" })
  loanId!: string;

  @ManyToOne(() => PyrlLoanEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "loan_id" })
  loan?: PyrlLoanEntity;

  /** This period's own principal+interest due for this loan, before carryover — `pyrl_loan_schedule`'s own due row for this period, at the moment this run was computed. */
  @Column({ type: "numeric", precision: 18, scale: 4, name: "scheduled_amount", transformer: RequiredMoneyTransformer })
  scheduledAmount!: Money;

  /** This SPECIFIC loan's own deferred shortfall carried forward from the prior period — never a blended/combined figure across loans. */
  @Column({ type: "numeric", precision: 18, scale: 4, name: "carryover", default: 0, transformer: RequiredMoneyTransformer })
  carryover!: Money;

  /** What was actually recovered from THIS loan this period, after the shared protected-net-floor headroom was allocated across every active loan in oldest-first order. */
  @Column({ type: "numeric", precision: 18, scale: 4, name: "recovered_amount", transformer: RequiredMoneyTransformer })
  recoveredAmount!: Money;

  /** `(scheduledAmount + carryover) - recoveredAmount` — this loan's own shortfall, picked up by the same carryover lookup next period. */
  @Column({ type: "numeric", precision: 18, scale: 4, name: "deferred_amount", default: 0, transformer: RequiredMoneyTransformer })
  deferredAmount!: Money;
}
