import { Money } from "../../../shared/money/money";

/**
 * READ-ONLY row shape for the `app.mv_defaulters` materialized view
 * (migration `0160`, Part B) — feeds the Defaulters register's first paint
 * (FR-DASH-002.1-adjacent). Plain DTO, not a TypeORM entity — see
 * `MaterializedViewsRepository`'s class doc comment.
 *
 * SQL (migration `0160`): `bill_invoice` rows with `balance > 0 AND due_date
 * < CURRENT_DATE AND status <> 'VOID'`, joined to `std_student`, GROUPED BY
 * student (the DDL's own `(student -> overdue, days)` shape is per-student,
 * not per-invoice), summing `balance` as `overdue_amount` and taking
 * `MAX(CURRENT_DATE - due_date)` as `days_overdue` (the student's single
 * *worst* overdue invoice drives the headline days-overdue figure — a
 * student with several overdue invoices shows their total owed but the age
 * of the oldest one). The `status <> 'VOID'` filter isn't spelled out in the
 * task brief's own bullet for this view but mirrors `mv_ar_summary`'s
 * identical exclusion for consistency — a VOIDed invoice is not a real
 * receivable regardless of its stale `due_date`/`balance`.
 */
export class MvDefaultersRow {
  /** `std_student.id`. */
  studentId!: string;

  admissionNo!: string;
  firstName!: string;
  lastName!: string;

  /** `std_student.class_id`. */
  classId!: string;

  /** Σ `bill_invoice.balance` across every overdue invoice for this student. */
  overdueAmount!: Money;

  /** `MAX(CURRENT_DATE - due_date)` across this student's overdue invoices — the oldest one, in days. */
  daysOverdue!: number;
}
