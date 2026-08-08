import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PyrlEmployeeEntity } from "./pyrl-employee.entity";

export type PyrlLoanRateKind = "FLAT" | "REDUCING";
export const PYRL_LOAN_RATE_KINDS: readonly PyrlLoanRateKind[] = ["FLAT", "REDUCING"];

export type PyrlLoanStatus = "PENDING_APPROVAL" | "ACTIVE" | "SETTLED" | "WRITTEN_OFF";
export const PYRL_LOAN_STATUSES: readonly PyrlLoanStatus[] = [
  "PENDING_APPROVAL",
  "ACTIVE",
  "SETTLED",
  "WRITTEN_OFF",
];

/**
 * Maps to `pyrl_loan` (docs/phase-4/04-schema-operations.md §4) — a staff
 * loan (FR-PYRL-004.1: principal/rate/term, amortization schedule,
 * per-run recovery). Module 15 (Payroll) **foundation pass only**
 * (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — genuine post-creation progression through
 * `PENDING_APPROVAL`->`ACTIVE`->`SETTLED`/`WRITTEN_OFF`, `balance`
 * decremented per run recovery.
 *
 * **`rate` is `NUMERIC(9,6)`, deliberately NOT routed through
 * `MoneyTransformer`** — same precision-preservation reasoning
 * `InvItemEntity.avgCost`/`InvMovementEntity.unitCost` document for their
 * own `NUMERIC(18,6)` columns: `Money`'s hard-coded `SCALE = 4`
 * (`shared/money/money.ts`) would silently round/truncate a percentage-
 * shaped decimal like `0.145000` (14.5%) to 4dp, an acceptable loss for
 * currency but not for an interest rate feeding amortization math. Left as
 * the raw decimal string Postgres's `pg` driver returns by default. No
 * other `NUMERIC(9,6)`-scale-6 rate-shaped precedent exists elsewhere in
 * this codebase (checked Settings' custom-field/Accounting's tax-related
 * fields — none), so this follows the Inventory `avg_cost` precedent per
 * the task brief's own fallback instruction.
 *
 * `approval_ref` stays a loose `uuid` with no FK — `platform/approvals` is
 * listed in this module's `mayImport` for forward-looking parity only (no
 * service calls it yet in this foundation pass), same judgement call
 * `ExpVoucherEntity.approvalRef`/`ProcPurchaseOrderEntity.approvalRef`
 * document; no entity anywhere in this codebase ever takes a real FK to
 * `appr_instance`.
 *
 * `balance` has no DB `DEFAULT` — set explicitly (typically `= principal`)
 * by the service layer at creation time, decremented as
 * `pyrl_loan_schedule.recovered_amount` accumulates.
 */
@Entity("pyrl_loan")
@Index("uq_pyrl_loan_number", ["number"], { unique: true })
@Check("ck_pyrl_loan_rate_kind", `"rate_kind" IN ('FLAT','REDUCING')`)
@Check("ck_pyrl_loan_status", `"status" IN ('PENDING_APPROVAL','ACTIVE','SETTLED','WRITTEN_OFF')`)
export class PyrlLoanEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "employee_id" })
  employeeId!: string;

  @ManyToOne(() => PyrlEmployeeEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employee_id" })
  employee?: PyrlEmployeeEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "principal",
    transformer: RequiredMoneyTransformer,
  })
  principal!: Money;

  /** NUMERIC(9,6), deliberately NOT Money-transformed — see class doc comment. */
  @Column({ type: "numeric", precision: 9, scale: 6, name: "rate" })
  rate!: string;

  @Column({ type: "varchar", length: 10, name: "rate_kind" })
  rateKind!: PyrlLoanRateKind;

  @Column({ type: "int", name: "term_months" })
  termMonths!: number;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: PyrlLoanStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance",
    transformer: RequiredMoneyTransformer,
  })
  balance!: Money;
}
