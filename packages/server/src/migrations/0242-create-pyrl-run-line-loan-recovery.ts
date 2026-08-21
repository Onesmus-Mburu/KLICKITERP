import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes the multi-loan half of the deferred Payroll findings (Phase 6
 * Slice 22 Part 6/7, "Option B — architecturally correct" per explicit user
 * decision, 2026-08-21): `compute()`/`commit()` used to only ever consider
 * `activeLoans[0]` — an employee with 2+ concurrently `ACTIVE` `pyrl_loan`
 * rows had every loan after the first silently invisible to real payroll
 * computation, live-confirmed via a real fixture. The root cause wasn't
 * just "the code only reads index 0" — `pyrl_run_line.loan_recovered`/
 * `.deferred_recovery` are single scalar amounts per employee per run, with
 * no way to represent "loan A got X, loan B got Y" at all. This table adds
 * that missing per-loan breakdown, the same relationship
 * `pyrl_run_line_component` already has to `pyrl_run_line` (one child row
 * per line-item, `run_line_id` CASCADE, the shared-catalogue side RESTRICT)
 * — `pyrl_run_line`'s own 2 scalar columns are UNCHANGED and remain the
 * real aggregate (sum across every loan this employee has), matching how
 * `gross`/`net_pay` etc. are aggregates while `pyrl_run_line_component`
 * carries the itemized breakdown behind them.
 *
 * One row per (run_line, loan) that had an installment due this period —
 * `scheduled_amount` (this period's own principal+interest due, before
 * carryover), `carryover` (this SPECIFIC loan's own deferred amount from
 * the prior period — replacing the old single-scalar-per-EMPLOYEE
 * carryover, which couldn't distinguish two loans' independent shortfalls),
 * `recovered_amount` (what this loan actually got this period, after
 * BR-PYRL-03's protected-net-floor headroom is shared/exhausted across
 * loans in oldest-first order), `deferred_amount` (this loan's own
 * shortfall, carried to next period via the SAME lookup this table now
 * backs). `BaseEntity` shape (no update-in-place lifecycle), matching
 * `pyrl_run_line_component`'s own reasoning exactly — computed once
 * alongside the parent line, never mutated after.
 */
export class CreatePyrlRunLineLoanRecovery0242 implements MigrationInterface {
  name = "CreatePyrlRunLineLoanRecovery1700000000242";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.pyrl_run_line_loan_recovery (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        run_line_id uuid NOT NULL,
        loan_id uuid NOT NULL,
        scheduled_amount numeric(18,4) NOT NULL,
        carryover numeric(18,4) NOT NULL DEFAULT 0,
        recovered_amount numeric(18,4) NOT NULL,
        deferred_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_pyrl_run_line_loan_recovery_run_line_loan UNIQUE (run_line_id, loan_id),
        CONSTRAINT fk_pyrl_run_line_loan_recovery_run_line_id FOREIGN KEY (run_line_id)
          REFERENCES app.pyrl_run_line(id) ON DELETE CASCADE,
        CONSTRAINT fk_pyrl_run_line_loan_recovery_loan_id FOREIGN KEY (loan_id)
          REFERENCES app.pyrl_loan(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_pyrl_run_line_loan_recovery_run_line ON app.pyrl_run_line_loan_recovery (run_line_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_pyrl_run_line_loan_recovery_loan ON app.pyrl_run_line_loan_recovery (loan_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.pyrl_run_line_loan_recovery`);
  }
}
