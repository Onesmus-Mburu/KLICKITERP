import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { FileObjectEntity } from "../../../platform/files";
import { BankAccountEntity } from "./bank-account.entity";

/**
 * Maps to `bank_statement_import` (docs/phase-4/04-schema-operations.md §5)
 * — one statement-file import run (FR-BANK-003.1), owning a batch of
 * derived `bank_statement_line` rows. Module 16 (Banking) **foundation pass
 * only**.
 *
 * `BaseEntity` (not `MutableBaseEntity`) — a one-shot import record: every
 * column here (`line_count`/`duplicate_count`/`imported_at`) is written
 * exactly once, at import time, by the next pass's import service; there is
 * no genuine post-creation edit path on this row itself — corrections
 * happen on the derived `bank_statement_line` rows, which DO carry
 * `MutableBaseEntity` (see that entity's own doc comment). Same append-only
 * shape `gl_journal_line`/`pay_receipt_split` establish for a row written
 * once and never revisited.
 */
@Entity("bank_statement_import")
export class BankStatementImportEntity extends BaseEntity {
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: BankAccountEntity;

  @Column({ type: "uuid", name: "file_id" })
  fileId!: string;

  @ManyToOne(() => FileObjectEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "file_id" })
  file?: FileObjectEntity;

  /** Per-bank saved column->field mapping (FR-BANK-003.1) — opaque to this foundation pass. */
  @Column({ type: "jsonb", name: "mapping_template" })
  mappingTemplate!: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "imported_at" })
  importedAt!: Date;

  @Column({ type: "int", name: "line_count" })
  lineCount!: number;

  @Column({ type: "int", name: "duplicate_count" })
  duplicateCount!: number;
}
