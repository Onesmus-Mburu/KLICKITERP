import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { SetTermEntity } from "../../../platform/settings";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillFeeStructureEntity } from "./bill-fee-structure.entity";

export type BillInvoiceStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "POSTED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "VOID";
export const BILL_INVOICE_STATUSES: readonly BillInvoiceStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
];

/** Statuses at/after which `trg_bill_invoice_immutable` freezes financial columns. */
export const BILL_INVOICE_IMMUTABLE_STATUSES: readonly BillInvoiceStatus[] = ["POSTED", "PARTIALLY_PAID", "PAID"];

export type BillInvoiceSource = "STRUCTURE" | "ADHOC" | "RECURRING" | "DEBIT_NOTE";
export const BILL_INVOICE_SOURCES: readonly BillInvoiceSource[] = [
  "STRUCTURE",
  "ADHOC",
  "RECURRING",
  "DEBIT_NOTE",
];

/**
 * Maps to `bill_invoice` (docs/phase-4/03-schema-student-finance.md §3) — the
 * core billing document. `MutableBaseEntity` — a real, deliberately *partial*
 * post-creation update path: `trg_bill_invoice_immutable` (migration `0070`)
 * freezes `subtotal`/`concession_total`/`total`/`structure_version`/
 * `fee_structure_id` once `status IN ('POSTED','PARTIALLY_PAID','PAID')`,
 * but explicitly ALLOWS continued updates to `paid_amount`/`balance`/
 * `status`/`version` (the payment-allocation path) — same shape as
 * `gl_journal`'s "immutable except append-only sub-ledger" precedent, except
 * here the mutable columns live on the same row rather than a child table.
 *
 * `balance` is a stored **cache** (`CHECK (balance = total - paid_amount)`,
 * N-1 derived), not computed at query time like `std_ledger_entry`'s running
 * balance — the DDL's own annotation.
 *
 * `journal_id` is a real FK to `gl_journal` (`accounting`, public barrel).
 * `void_reason`/`voided_by` are populated only when `status = 'VOID'`;
 * `voided_by` is a loose `uuid` with no FK — `platform/users` is not in this
 * module's `mayImport` list (same "loose reference" treatment as
 * `gl_journal.posted_by`).
 *
 * Indexes exactly as specified: `ix_bill_invoice_student` (plain composite),
 * `ix_bill_invoice_open_p` — a **partial covering index** (`WHERE balance >
 * 0` with `INCLUDE (student_id, balance)`) TypeORM's `@Index` decorator
 * cannot express (`INCLUDE` isn't decorator-supported) — realized as raw SQL
 * in migration `0070`, this entity carries no decorator for it, only this
 * pointer comment. `uq_bill_invoice_structure_p` (BR-BILL-04 idempotency —
 * "a student may receive at most one structure-generated invoice per (term,
 * structure version)") IS expressible via `@Index`'s `where` option since it
 * needs no `INCLUDE` clause, so it's declared below.
 */
@Entity("bill_invoice")
@Index("uq_bill_invoice_number", ["number"], { unique: true })
@Index("ix_bill_invoice_student", ["studentId", "status"])
@Index("uq_bill_invoice_structure_p", ["studentId", "termId", "feeStructureId"], {
  unique: true,
  where: `"source" = 'STRUCTURE' AND "status" <> 'VOID'`,
})
@Check("ck_bill_invoice_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','PARTIALLY_PAID','PAID','VOID')`)
@Check("ck_bill_invoice_source", `"source" IN ('STRUCTURE','ADHOC','RECURRING','DEBIT_NOTE')`)
// `ck_bill_invoice_due_after_issue` (due_date >= issue_date) dropped by
// migration `0232` (Phase 6 Slice 10 correction) — a due date genuinely CAN
// precede the issue date: an invoice generated today for a fee category
// whose fee-structure-line due date has already passed must preserve that
// REAL due date (so it correctly shows as already-overdue), not be forced
// to satisfy an ordering that only ever made sense for the common case.
@Check("ck_bill_invoice_balance", `"balance" = "total" - "paid_amount"`)
@Check("ck_bill_invoice_paid_amount_range", `"paid_amount" >= 0 AND "paid_amount" <= "total"`)
export class BillInvoiceEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "uuid", name: "term_id" })
  termId!: string;

  @ManyToOne(() => SetTermEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "term_id" })
  term?: SetTermEntity;

  @Column({ type: "uuid", name: "fee_structure_id", nullable: true })
  feeStructureId!: string | null;

  @ManyToOne(() => BillFeeStructureEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_structure_id" })
  feeStructure?: BillFeeStructureEntity | null;

  @Column({ type: "int", name: "structure_version", nullable: true })
  structureVersion!: number | null;

  @Column({ type: "date", name: "issue_date" })
  issueDate!: string;

  @Column({ type: "date", name: "due_date" })
  dueDate!: string;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BillInvoiceStatus;

  @Column({ type: "varchar", length: 12, name: "source" })
  source!: BillInvoiceSource;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "subtotal",
    transformer: RequiredMoneyTransformer,
  })
  subtotal!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "concession_total",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  concessionTotal!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "paid_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  paidAmount!: Money;

  /** Stored N-1 derived cache — `CHECK (balance = total - paid_amount)`. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance",
    transformer: RequiredMoneyTransformer,
  })
  balance!: Money;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "text", name: "void_reason", nullable: true })
  voidReason!: string | null;

  /** Loose uuid, no FK — `platform/users` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "voided_by", nullable: true })
  voidedBy!: string | null;
}
