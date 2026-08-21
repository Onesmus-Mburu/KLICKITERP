import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlPeriodEntity } from "../../../accounting";
import { BankAccountEntity } from "./bank-account.entity";

export type BankReconciliationStatus = "IN_PROGRESS" | "LOCKED" | "REOPENED";
export const BANK_RECONCILIATION_STATUSES: readonly BankReconciliationStatus[] = [
  "IN_PROGRESS",
  "LOCKED",
  "REOPENED",
];

/**
 * Maps to `bank_reconciliation` (docs/phase-4/04-schema-operations.md §5) —
 * one period's bank-reconciliation workspace/snapshot for one account
 * (FR-BANK-004.1). Module 16 (Banking) **foundation pass only**.
 *
 * **BR-BANK-03 — wired as of 2026-08-21**: "a period's bank reconciliation
 * must be locked before that period can be HARD_CLOSED." `accounting`'s
 * `FiscalYearsService.hardClosePeriod()` now enforces this via a raw SQL
 * check against `bank_account`/`bank_reconciliation` directly (a normal
 * TS import would create a circular dependency between `accounting` and
 * `domains/banking` — see `hardClosePeriod()`'s own doc comment). The
 * reverse loophole is closed too: `ReconciliationService.reopen()` now
 * refuses to reopen a `LOCKED` reconciliation once its own period has
 * already reached `HARD_CLOSED`.
 *
 * `MutableBaseEntity` — real status progression `IN_PROGRESS -> LOCKED ->
 * REOPENED`, `locked_by`/`locked_at` populated only at lock time.
 *
 * `trg_bank_reconciliation_immutable` (migration `0140`) freezes
 * `book_balance`/`bank_balance`/`outstanding` once `status='LOCKED'`,
 * unless the row is simultaneously transitioning to `REOPENED` — the
 * explicit, permission-gated `banking:reconciliation:reopen` escape hatch
 * (FR-BANK-004.1).
 *
 * `locked_by` is a loose uuid, no FK — `platform/users` is listed in this
 * foundation pass's `mayImport` for parity/forward-looking readiness only
 * (same judgement call every other module this size has made for a column
 * with no `→` arrow in the source DDL).
 */
@Entity("bank_reconciliation")
@Index("uq_bank_reconciliation_account_period", ["accountId", "periodId"], { unique: true })
@Check("ck_bank_reconciliation_status", `"status" IN ('IN_PROGRESS','LOCKED','REOPENED')`)
export class BankReconciliationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: BankAccountEntity;

  @Column({ type: "uuid", name: "period_id" })
  periodId!: string;

  @ManyToOne(() => GlPeriodEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "period_id" })
  period?: GlPeriodEntity;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: BankReconciliationStatus;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "book_balance",
    transformer: RequiredMoneyTransformer,
  })
  bookBalance!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "bank_balance",
    transformer: RequiredMoneyTransformer,
  })
  bankBalance!: Money;

  /** Outstanding (unpresented cheques / uncleared deposits) items snapshot — opaque to this foundation pass. */
  @Column({ type: "jsonb", name: "outstanding" })
  outstanding!: Record<string, unknown>;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "locked_by", nullable: true })
  lockedBy!: string | null;

  @Column({ type: "timestamptz", name: "locked_at", nullable: true })
  lockedAt!: Date | null;
}
