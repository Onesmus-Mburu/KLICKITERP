import { Money } from "../../../shared/money/money";

export type MvIncomeExpenseAccountClass = "INCOME" | "EXPENSE";

/**
 * READ-ONLY row shape for the `app.mv_income_expense` materialized view
 * (migration `0160`, Part B) — feeds the Dashboard's Income vs Expense chart
 * (FR-DASH-002.1: Revenue/Expenses/Surplus = income-statement accounts for
 * the period). Plain DTO, not a TypeORM entity — see
 * `MaterializedViewsRepository`'s class doc comment.
 *
 * SQL (migration `0160`): groups `gl_period_account_total` joined to
 * `gl_account` (filtered to `class IN ('INCOME','EXPENSE')`) and `gl_period`,
 * by `period_id`/`gl_account.class`, summing `debit_total`/`credit_total`.
 * `gl_period.starts_on`/`ends_on` are carried through (functionally
 * dependent on `period_id`, included via `GROUP BY`) so a chart can label
 * its x-axis without a second round-trip to `gl_period`.
 *
 * **"account class/group" judgement call**: the DDL's own column list says
 * "account class/group" — `gl_account` has a real `class` column
 * (`ASSET|LIABILITY|EQUITY|INCOME|EXPENSE`) but no separate "group" column
 * anywhere in the schema, so this view groups by `class` only (the task
 * brief's own explicit instruction, narrower than the DDL's paraphrase).
 *
 * Report-of-record income statements bypass this view entirely and read
 * `gl_journal`/`gl_journal_line` directly (FR-RPT-008) — this MV exists
 * purely for the Dashboard chart's fast first paint.
 */
export class MvIncomeExpenseRow {
  /** `gl_period_account_total.period_id`. */
  periodId!: string;

  /** `gl_period.starts_on` — ISO date string. */
  periodStartsOn!: string;

  /** `gl_period.ends_on` — ISO date string. */
  periodEndsOn!: string;

  accountClass!: MvIncomeExpenseAccountClass;

  /** Σ `gl_period_account_total.debit_total` for this `(period, class)` group. */
  debitTotal!: Money;

  /** Σ `gl_period_account_total.credit_total` for this `(period, class)` group. */
  creditTotal!: Money;
}
