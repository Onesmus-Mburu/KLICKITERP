import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { StdStudentEntity } from "./std-student.entity";

/**
 * Maps to `std_ledger_entry` (docs/phase-4/03-schema-student-finance.md §2)
 * — the student sub-ledger. Append-only, "written by posting flows" per the
 * DDL's own comment: `BaseEntity` (not `MutableBaseEntity`), same treatment
 * as `gl_journal_line` — no update semantics, no `version` column.
 *
 * The running balance is explicitly NOT a stored column — the DDL says "running
 * balance computed by window function" — see `StdLedgerEntryRepository.getStatementWithRunningBalance()`,
 * which computes `SUM(debit - credit) OVER (PARTITION BY student_id ORDER BY
 * posted_at, id)` at query time. Σ per student must equal the AR control
 * account's lines with matching `entity_ref` (sweep NFR-INT-002, a future
 * cross-module reconciliation once Billing/Module 9's postings exist) —
 * that reconciliation is out of scope for this module.
 *
 * `StudentLedgerService.appendEntry()` is documented as the sole intended
 * write path (architectural convention, not yet DB-trigger-enforced the way
 * `trg_gl_writer_guard` locks down `gl_journal`/`gl_journal_line` — see that
 * service's doc comment for the honest caveat).
 */
@Entity("std_ledger_entry")
@Index("ix_std_ledger_student_at", ["studentId", "postedAt"])
export class StdLedgerEntryEntity extends BaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "date", name: "entry_date" })
  entryDate!: string;

  @Column({ type: "timestamptz", name: "posted_at" })
  postedAt!: Date;

  @Column({ type: "varchar", length: 30, name: "doc_type" })
  docType!: string;

  @Column({ type: "uuid", name: "doc_id" })
  docId!: string;

  @Column({ type: "varchar", length: 30, name: "doc_number" })
  docNumber!: string;

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

  @Column({ type: "varchar", length: 200, name: "memo", nullable: true })
  memo!: string | null;
}
