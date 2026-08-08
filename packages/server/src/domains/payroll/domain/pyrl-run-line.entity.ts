import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { FileObjectEntity } from "../../../platform/files";
import { PyrlRunEntity } from "./pyrl-run.entity";
import { PyrlEmployeeEntity } from "./pyrl-employee.entity";

export type PyrlRunLinePaidVia = "BANK" | "MPESA_B2C" | "CASH";
export const PYRL_RUN_LINE_PAID_VIA_VALUES: readonly PyrlRunLinePaidVia[] = ["BANK", "MPESA_B2C", "CASH"];

/**
 * Maps to `pyrl_run_line` (docs/phase-4/04-schema-operations.md §4) — one
 * employee's payslip within a `pyrl_run`. Module 15 (Payroll) **foundation
 * pass only** (docs/phase-5/PROGRESS.md).
 *
 * **`BaseEntity`, not `MutableBaseEntity`** — a documented judgement call.
 * The task brief offered either treatment ("frozen once the parent run is
 * COMMITTED+, same treatment as `gl_journal_line` — `BaseEntity`, or
 * `MutableBaseEntity` if you find a real pre-commit edit window during
 * `REVIEW`"). No pre-commit edit window is named anywhere in FR-PYRL-006.1
 * or the DDL — a run's lines are computed wholesale by the (future)
 * computation engine at `DRAFT`->`COMPUTED` and, at most, recomputed
 * wholesale again on a re-run while still pre-`COMMITTED` (never
 * field-by-field edited by a human), so this mirrors `GlJournalLineEntity`
 * exactly: no optimistic-lock `version` column needed, immutability is
 * enforced by `trg_pyrl_run_line_immutable` (a DB trigger), not by
 * `MutableBaseEntity`'s per-row version counter.
 *
 * **`trg_pyrl_run_line_immutable`** (migration `0130`) — once the PARENT
 * `pyrl_run.status` has reached `COMMITTED` or beyond, freezes every
 * financial/identity column on this row EXCEPT `payslip_file_id`/
 * `paid_via`/`paid_at` — the payment-recording fields, which legitimately
 * get filled in AFTER commit during the `PAID` transition (P-28 per the
 * DDL's cross-reference, FR-PYRL-006.1's `COMMITTED -> PAID` step).
 *
 * `run_id` -> `pyrl_run` is CASCADE (a true owned child). `employee_id` ->
 * `pyrl_employee` is RESTRICT. `payslip_file_id` -> `file_object` is
 * nullable, `ON DELETE SET NULL` — same convention
 * `ProcQuotationEntity.documentFileId`/`ProcContractEntity.documentFileId`
 * establish for optional document attachments.
 *
 * `deferred_recovery` (BR-PYRL-03: "Loan recoveries cannot reduce net pay
 * below the... protected-net floor... shortfalls defer to subsequent
 * periods automatically") carries the unrecovered loan-installment amount
 * forward — computed and consumed by the next pass's loan-recovery engine,
 * not enforced at the DB layer here.
 */
@Entity("pyrl_run_line")
@Index("uq_pyrl_run_line_run_employee", ["runId", "employeeId"], { unique: true })
@Check("ck_pyrl_run_line_paid_via", `"paid_via" IS NULL OR "paid_via" IN ('BANK','MPESA_B2C','CASH')`)
export class PyrlRunLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "run_id" })
  runId!: string;

  @ManyToOne(() => PyrlRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_id" })
  run?: PyrlRunEntity;

  @Column({ type: "uuid", name: "employee_id" })
  employeeId!: string;

  @ManyToOne(() => PyrlEmployeeEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employee_id" })
  employee?: PyrlEmployeeEntity;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "gross", transformer: RequiredMoneyTransformer })
  gross!: Money;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "taxable", transformer: RequiredMoneyTransformer })
  taxable!: Money;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "paye", transformer: RequiredMoneyTransformer })
  paye!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "nssf_employee",
    transformer: RequiredMoneyTransformer,
  })
  nssfEmployee!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "nssf_employer",
    transformer: RequiredMoneyTransformer,
  })
  nssfEmployer!: Money;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "shif", transformer: RequiredMoneyTransformer })
  shif!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "ahl_employee",
    transformer: RequiredMoneyTransformer,
  })
  ahlEmployee!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "ahl_employer",
    transformer: RequiredMoneyTransformer,
  })
  ahlEmployer!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "loan_recovered",
    transformer: RequiredMoneyTransformer,
  })
  loanRecovered!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "other_deductions",
    transformer: RequiredMoneyTransformer,
  })
  otherDeductions!: Money;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "net_pay", transformer: RequiredMoneyTransformer })
  netPay!: Money;

  /** BR-PYRL-03 carryover — see class doc comment. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "deferred_recovery",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  deferredRecovery!: Money;

  @Column({ type: "uuid", name: "payslip_file_id", nullable: true })
  payslipFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "payslip_file_id" })
  payslipFile?: FileObjectEntity | null;

  @Column({ type: "varchar", length: 10, name: "paid_via", nullable: true })
  paidVia!: PyrlRunLinePaidVia | null;

  @Column({ type: "timestamptz", name: "paid_at", nullable: true })
  paidAt!: Date | null;
}
