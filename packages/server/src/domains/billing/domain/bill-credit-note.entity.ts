import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { BillInvoiceEntity } from "./bill-invoice.entity";

export type BillNoteStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED";
export const BILL_NOTE_STATUSES: readonly BillNoteStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"];

/**
 * Maps to `bill_credit_note` (docs/phase-4/03-schema-student-finance.md §3)
 * — realizes the task's "`bill_credit_note` / `bill_debit_note`" DDL note as
 * ONE of the four real tables the split produces (see this pass's report for
 * the full split rationale): `bill_credit_note`, `bill_credit_note_line`,
 * `bill_debit_note`, `bill_debit_note_line`. Shaped like `bill_invoice`
 * (minus the student/term/status-machine specifics that don't apply to a
 * note) plus its own `reason`/`total`/`approval_ref`/`journal_id`.
 *
 * `invoice_id` is a real FK to `bill_invoice` (a credit note is always
 * issued against one specific invoice, per the task's clarification —
 * unlike a debit note, which targets a student directly). `MutableBaseEntity`
 * — a real post-creation update path: `status` progresses
 * `DRAFT -> PENDING_APPROVAL -> APPROVED -> POSTED` (BR-BILL-09), with
 * `approval_ref`/`journal_id` populated only once decided/posted, same shape
 * as `bill_concession`/`gl_budget`.
 */
@Entity("bill_credit_note")
@Index("uq_bill_credit_note_number", ["number"], { unique: true })
@Index("ix_bill_credit_note_invoice", ["invoiceId"])
@Check("ck_bill_credit_note_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
@Check("ck_bill_credit_note_total_positive", `"total" > 0`)
export class BillCreditNoteEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "invoice_id" })
  invoiceId!: string;

  @ManyToOne(() => BillInvoiceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity;

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
