import { Money } from "../../../shared/money/money";

export type MvArSummaryAgingBucket = "0-30" | "31-60" | "61-90" | "90+";

/**
 * READ-ONLY row shape for the `app.mv_ar_summary` materialized view
 * (migration `0160`, Part B) — feeds the Dashboard's "Outstanding Fees" KPI
 * and its aging drill-down (FR-DASH-002.1). Plain DTO, not a TypeORM entity
 * — see `MaterializedViewsRepository`'s class doc comment.
 *
 * SQL (migration `0160`): groups open `bill_invoice` rows (`balance > 0 AND
 * status <> 'VOID'`) joined to `std_student` for `class_id`, by `class_id`
 * and a computed aging bucket (`CASE` on `CURRENT_DATE - due_date`:
 * `0-30`/`31-60`/`61-90`/`90+`), summing `balance`.
 *
 * **Aging-bucket judgement call**: the DDL names exactly these four buckets
 * with no separate "not yet due" bucket. An invoice whose `due_date` is in
 * the future produces a *negative* `CURRENT_DATE - due_date`, which the
 * `CASE` expression's `<= 30` branch also catches — not-yet-due invoices are
 * folded into the `0-30` bucket alongside genuinely 0-30-days-overdue ones.
 * This is the standard "current + 1-30" aging-report convention and keeps
 * the bucket count exactly matching the DDL's own four-value list.
 */
export class MvArSummaryRow {
  /** `std_student.class_id`. */
  classId!: string;

  agingBucket!: MvArSummaryAgingBucket;

  /** Σ `bill_invoice.balance` for this `(class, aging bucket)` group. */
  balance!: Money;
}
