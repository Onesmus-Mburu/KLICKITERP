import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BankAccountEntity } from "./bank-account.entity";
import { BankStatementImportEntity } from "./bank-statement-import.entity";

export type BankStatementLineReconState = "UNMATCHED" | "MATCHED" | "ADJUSTED";
export const BANK_STATEMENT_LINE_RECON_STATES: readonly BankStatementLineReconState[] = [
  "UNMATCHED",
  "MATCHED",
  "ADJUSTED",
];

/**
 * Maps to `bank_statement_line` (docs/phase-4/04-schema-operations.md §5) —
 * one imported bank-statement transaction line, staged for reconciliation.
 * Module 16 (Banking) **foundation pass only**.
 *
 * `MutableBaseEntity` — a genuine post-creation edit path: `recon_state`
 * flips `UNMATCHED -> MATCHED`/`ADJUSTED` in place as the next pass's
 * reconciliation-matching engine runs (FR-BANK-004.1's auto-match passes) —
 * the row is created once at import time and then revisited by a later
 * workflow step, the same shape `bill_installment`'s own status-flip
 * establishes.
 *
 * `trg_bank_statement_line_immutable` (migration `0140`, BR-BANK-02)
 * freezes `debit`/`credit`/`line_date`/`description`/`external_ref`/
 * `dedupe_hash` once `recon_state <> 'UNMATCHED'` — "a statement line may
 * reconcile against book entries only once; reconciled entries lock against
 * modification" — while leaving `recon_state` itself writable (an
 * authorized unreconcile/reopen flow the next pass may need).
 *
 * `uq_bank_stmt_line_dedupe` (`account_id`, `dedupe_hash`) is the DDL's own
 * dedupe-on-reimport key. `ix_bank_stmt_unmatched_p` (migration `0140`) is
 * the partial index (`WHERE recon_state='UNMATCHED'`) backing
 * `BankStatementLineRepository.findUnmatchedForAccount()`.
 */
@Entity("bank_statement_line")
@Index("uq_bank_stmt_line_dedupe", ["accountId", "dedupeHash"], { unique: true })
@Index("ix_bank_stmt_unmatched_p", ["accountId", "lineDate"], { where: `"recon_state" = 'UNMATCHED'` })
@Check("ck_bank_stmt_line_recon_state", `"recon_state" IN ('UNMATCHED','MATCHED','ADJUSTED')`)
@Check("ck_bank_stmt_line_amounts_nonneg", `"debit" >= 0 AND "credit" >= 0`)
export class BankStatementLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "import_id" })
  importId!: string;

  @ManyToOne(() => BankStatementImportEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "import_id" })
  import?: BankStatementImportEntity;

  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: BankAccountEntity;

  @Column({ type: "date", name: "line_date" })
  lineDate!: string;

  @Column({ type: "text", name: "description" })
  description!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "debit",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  debit!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "credit",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  credit!: Money;

  @Column({ type: "varchar", length: 80, name: "external_ref", nullable: true })
  externalRef!: string | null;

  @Column({ type: "varchar", length: 64, name: "dedupe_hash" })
  dedupeHash!: string;

  @Column({ type: "varchar", length: 10, name: "recon_state" })
  reconState!: BankStatementLineReconState;
}
