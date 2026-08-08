import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { SetTermEntity } from "../../../platform/settings";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillInvoiceEntity } from "./bill-invoice.entity";
import { BillNoteStatus } from "./bill-credit-note.entity";

/**
 * Maps to `bill_debit_note` (docs/phase-4/03-schema-student-finance.md §3) —
 * the second table of the credit/debit-note split (see `BillCreditNoteEntity`'s
 * doc comment for the full rationale). Unlike a credit note, `student_id` is
 * a real FK directly to `std_student`, not to a specific `bill_invoice` — a
 * debit note isn't against one invoice, it creates NEW charges (per the
 * task's own clarification). `MutableBaseEntity` — same status-machine
 * update-path reasoning as `BillCreditNoteEntity`.
 *
 * **`term_id`/`invoice_id`** (migration `0072`, PASS B): the foundation-pass
 * DDL had no place to persist either. `DebitNotesService.post()` (PASS B's
 * documented design decision — see that service's class doc comment) calls
 * `InvoicingService.generateInvoice()`/`.postInvoice()` to realize P-07
 * through the ordinary invoicing/posting engine rather than duplicating it —
 * `bill_invoice.term_id` is NOT NULL, so the term the debit note's charges
 * belong to must be captured at `create()` time and persisted somewhere for
 * `post()` to use later; `invoice_id` records which `bill_invoice` posting
 * produced, populated only once `status='POSTED'`. Both nullable (a DRAFT
 * debit note has no invoice yet; `term_id` is populated at `create()` time in
 * practice, nullable only because pre-`0072` rows have none).
 */
@Entity("bill_debit_note")
@Index("uq_bill_debit_note_number", ["number"], { unique: true })
@Index("ix_bill_debit_note_student", ["studentId"])
@Check("ck_bill_debit_note_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
@Check("ck_bill_debit_note_total_positive", `"total" > 0`)
export class BillDebitNoteEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  /** Migration `0072` (PASS B) — see class doc comment. */
  @Column({ type: "uuid", name: "term_id", nullable: true })
  termId!: string | null;

  @ManyToOne(() => SetTermEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "term_id" })
  term?: SetTermEntity | null;

  /** Migration `0072` (PASS B) — the `bill_invoice` `DebitNotesService.post()` generated, see class doc comment. */
  @Column({ type: "uuid", name: "invoice_id", nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => BillInvoiceEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity | null;

  @Column({ type: "text", name: "reason" })
  reason!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: BillNoteStatus;

  /** Loose uuid, no FK — `platform/approvals` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;
}
