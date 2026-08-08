import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { GlJournalEntity, GlJournalLineEntity } from "../../../accounting";
import { BankReconciliationEntity } from "./bank-reconciliation.entity";
import { BankStatementLineEntity } from "./bank-statement-line.entity";

/**
 * Maps to `bank_recon_match` (docs/phase-4/04-schema-operations.md §5) — one
 * matched pair (statement line <-> book/journal-line entry, or a one-click
 * adjustment) inside a `bank_reconciliation`. Module 16 (Banking)
 * **foundation pass only**.
 *
 * **Base-class judgement call**: plain `BaseEntity` — a match row is
 * created once, atomically, at the moment the next pass's matching engine
 * (auto-match pass or manual match) decides a pairing; the DDL names no
 * column here written after the initial INSERT, and "unmatching" is
 * naturally a DELETE, not an UPDATE (mirroring how `gl_journal_line`/
 * `pay_receipt_split`-shaped append-only rows are handled elsewhere in this
 * codebase). Unlike `proc_voucher_allocation` (which went `MutableBaseEntity`
 * because its parent `proc_payment_voucher` carries a real DRAFT status that
 * allocations are freely re-edited under), `bank_reconciliation` has no
 * DRAFT-equivalent "freely re-editable before real work starts" state for
 * its matches — matches only ever get created once real matching begins —
 * so this table follows the append-only divergence instead.
 *
 * `statement_line_id` and `journal_line_id` both carry real UNIQUE
 * constraints — BR-BANK-02's "a statement line may reconcile against book
 * entries only once" realized as single-use matching at the DB layer (a
 * given statement line or journal line can appear in at most one
 * `bank_recon_match` row, full stop; Postgres UNIQUE treats each NULL in
 * `journal_line_id` as distinct, so multiple adjustment-only matches with no
 * journal line may coexist without special partial-index handling).
 *
 * `adjustment_journal_id` is a real, nullable FK to `gl_journal` — not
 * `gl_journal_line`. The column's own name and every other `*_journal_id`
 * column in this codebase (`bank_transfer.journal_id`, `bank_deposit.
 * journal_id`, etc.) point at a whole journal, never one of its lines; the
 * task brief's own cross-module FK recap groups this column alongside
 * `journal_line_id` under a single "gl_journal_line (accounting)" bullet,
 * read here as shorthand for "the accounting-core FKs on this table," not a
 * literal shared target type — documented explicitly for the next reader.
 * Populated only for FR-BANK-004.1's "one-click create adjustment" match
 * kind (bank charges/interest income); left NULL for an ordinary
 * statement-line<->journal-line match.
 */
@Entity("bank_recon_match")
@Index("uq_bank_recon_match_statement_line", ["statementLineId"], { unique: true })
@Index("uq_bank_recon_match_journal_line", ["journalLineId"], { unique: true })
export class BankReconMatchEntity extends BaseEntity {
  @Column({ type: "uuid", name: "reconciliation_id" })
  reconciliationId!: string;

  @ManyToOne(() => BankReconciliationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reconciliation_id" })
  reconciliation?: BankReconciliationEntity;

  @Column({ type: "uuid", name: "statement_line_id" })
  statementLineId!: string;

  @ManyToOne(() => BankStatementLineEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "statement_line_id" })
  statementLine?: BankStatementLineEntity;

  @Column({ type: "uuid", name: "journal_line_id", nullable: true })
  journalLineId!: string | null;

  @ManyToOne(() => GlJournalLineEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_line_id" })
  journalLine?: GlJournalLineEntity | null;

  /** Real FK to `gl_journal`, not `gl_journal_line` — see class doc comment. */
  @Column({ type: "uuid", name: "adjustment_journal_id", nullable: true })
  adjustmentJournalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "adjustment_journal_id" })
  adjustmentJournal?: GlJournalEntity | null;
}
