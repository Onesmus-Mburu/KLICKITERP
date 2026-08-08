import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 12 (Part A — wallet-funded receipts backend). `pay_receipt
 * .journal_id` was `NOT NULL` from migration `0080` onward on the premise
 * that "a receipt is always posted atomically with its GL journal, never
 * left in an unposted/DRAFT state" (see `PayReceiptEntity`'s own doc
 * comment) — true for every receipt captured via `ReceiptsService
 * .captureReceipt()`, but NOT true for a wallet-funded receipt: when a
 * student's fees are swept/transferred from their own wallet
 * (`WalletTransactionsService.transferToFees()`/`.sweepToInvoices()`), the
 * real GL effect (debit `WALLET`, credit `AR_STUDENT`) already happened via
 * the WALLET module's own journal, tagged against the `wall_transaction` row,
 * not this receipt. The new `ReceiptsService.recordWalletFundedReceipt()`
 * (this same pass) creates a `pay_receipt` purely as a genuine, real
 * audit-trail document — it does NOT call `PostingService.post()` — so it has
 * no journal of its own to point at.
 *
 * **Why nullable, not "point it at the wallet's own journal"**: reusing the
 * wallet's journal id on the receipt would make `ReceiptsService
 * .reverseReceipt()`'s "swap every debit/credit of `original.journalId`"
 * algorithm silently reverse the WALLET/AR_STUDENT journal on an ordinary
 * receipt reversal — restoring the GL balance while leaving `wall_wallet
 * .balance` completely untouched, a real, silent GL/subledger desync. This is
 * exactly the risk this whole dispatch exists to avoid; the reversal guard
 * added to `reverseReceipt()` in this same pass (blocking reversal outright
 * for a WALLET/CREDIT_BALANCE-funded receipt) is the OTHER half of closing
 * it. A null `journal_id` makes "this receipt posted nothing of its own"
 * structurally visible rather than a fact only living in a code comment.
 *
 * FK stays exactly as-is (`fk_pay_receipt_journal_id ... ON DELETE
 * RESTRICT`) — `ALTER COLUMN ... DROP NOT NULL` does not touch the FK
 * constraint at all, a `NULL` value is simply exempt from FK enforcement by
 * definition (standard SQL: a `NULL` foreign key column never violates a
 * `REFERENCES` constraint).
 *
 * Reporting-query sweep performed before writing this migration (see this
 * slice's PROGRESS.md entry for the file-by-file result): no query anywhere
 * in this codebase INNER JOINs `gl_journal` through `pay_receipt.journal_id`
 * — `domains/reporting`'s `receipts-register.report.ts`/`fee-collection
 * .report.ts`/`mv_daily_collections` all read `pay_receipt`/
 * `pay_receipt_split` directly with no join to `gl_journal` at all, and
 * `general-ledger.report.ts` reads `gl_journal_line` directly with no join
 * back to `pay_receipt` either. No fix was needed anywhere outside this
 * migration + the entity/DTO type changes landing alongside it.
 */
export class MakePayReceiptJournalIdNullable0233 implements MigrationInterface {
  name = "MakePayReceiptJournalIdNullable1700000000233";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.pay_receipt ALTER COLUMN journal_id DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Any existing NULL journal_id rows (wallet-funded receipts, this pass's
    // own new capability) would make this migration irreversible in the
    // strict sense — re-adding NOT NULL against a table that already has
    // NULLs fails outright, the correct behavior (a silent backfill here
    // would fabricate a fake journal reference on a row that legitimately
    // has none). Matches this codebase's own precedent of a `down()` that is
    // only safe to run before any dependent data exists.
    await queryRunner.query(`ALTER TABLE app.pay_receipt ALTER COLUMN journal_id SET NOT NULL`);
  }
}
