import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 10 (correction) — drops `ck_bill_invoice_due_after_issue`
 * (`CHECK (due_date >= issue_date)`, migration `0070`). This constraint had
 * no business-rule reference tied to it in `0070`'s own doc comment (unlike
 * every genuinely load-bearing invariant that migration documents) — it read
 * as a general sanity guard, not a deliberate rule, and it was blocking a
 * real, legitimate case: generating an invoice TODAY for a fee category
 * whose fee-structure-line due date has already passed (e.g. a school
 * catching up on billing a one-time fee weeks after it was nominally due).
 *
 * A prior pass (this same Slice 10) worked around the constraint by
 * CLAMPING the invoice's `due_date` up to today — but that silently changed
 * the due date away from what the fee structure actually configures, which
 * is real, incorrect data loss the user caught and asked to be reverted:
 * the invoice must show the REAL configured due date, even when it's
 * already in the past relative to `issue_date` (today) — correctly landing
 * the invoice in "Pending" (overdue) immediately, which is the accurate
 * real-world state, not "Upcoming."
 *
 * **Why the constraint is dropped, not just loosened**: `issue_date` is not
 * a free label — it's the invoice's real GL journal posting date
 * (`InvoicingService`'s own `journalDate: invoice.issueDate`), and
 * `PostingService.post()` requires an OPEN `gl_period` covering that date,
 * rejecting `HARD_CLOSED` periods. `issue_date` must therefore stay "today"
 * (the real day the invoice is created) — it cannot be backdated to match
 * an old due date without risking a much less predictable "period closed"
 * failure. That leaves `due_date < issue_date` as a genuinely valid,
 * intentional state for a late-generated one-time-fee invoice — not a data
 * error to guard against.
 *
 * No other code in this codebase assumes `due_date >= issue_date` always
 * holds (confirmed by reading every `bill_invoice.due_date`/`issue_date`
 * consumer before writing this migration: `AllocationService`/Pending-
 * Upcoming bucketing/aging reports all key off `due_date` alone, comparing
 * it to `balance`/`CURRENT_DATE` — never to `issue_date`).
 */
export class DropBillInvoiceDueAfterIssueCheck0232 implements MigrationInterface {
  name = "DropBillInvoiceDueAfterIssueCheck1700000000232";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_invoice DROP CONSTRAINT IF EXISTS ck_bill_invoice_due_after_issue`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_invoice ADD CONSTRAINT ck_bill_invoice_due_after_issue CHECK (due_date >= issue_date)`);
  }
}
