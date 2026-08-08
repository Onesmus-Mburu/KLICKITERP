import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillConcessionKind, BillConcessionSchemeEntity } from "./bill-concession-scheme.entity";
import { BillInvoiceLineEntity } from "./bill-invoice-line.entity";
import { BillInvoiceEntity } from "./bill-invoice.entity";
import { BillSponsorAwardEntity } from "./bill-sponsor-award.entity";

export type BillConcessionStatus = "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "REJECTED";
export const BILL_CONCESSION_STATUSES: readonly BillConcessionStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
  "REJECTED",
];

/**
 * Maps to `bill_concession` (docs/phase-4/03-schema-student-finance.md §3) —
 * one applied waiver/discount/scholarship/bursary/sponsor-award instance
 * against a student's invoice (or a specific line). `MutableBaseEntity` — a
 * real post-creation update path: `status` progresses
 * `PENDING_APPROVAL -> APPROVED -> POSTED` (or `-> REJECTED`) via the next
 * pass's `ApprovalEngineService`-backed workflow (BR-BILL-07), with
 * `approval_ref`/`journal_id` populated only once decided/posted.
 *
 * `kind` mirrors `bill_concession_scheme.kind`'s domain (`WAIVER`/`DISCOUNT`/
 * `SCHOLARSHIP`/`BURSARY`) — a concession may exist without a `scheme_id`
 * (nullable — an ad-hoc one-off waiver not backed by a reusable scheme
 * template), in which case `kind` alone carries the classification.
 * `invoice_id`/`invoice_line_id` are both nullable — a concession may target
 * either the whole invoice or one specific line; the next pass's service
 * validates exactly one of the two is meaningfully set per BR-BILL-06's
 * scope. `approval_ref` is a loose `uuid`, no FK — `platform/approvals` is
 * not in this module's `mayImport` list (same "loose reference" treatment
 * as `gl_budget.approval_ref`). `journal_id` is a real FK to `gl_journal`.
 */
@Entity("bill_concession")
@Index("ix_bill_concession_invoice", ["invoiceId"])
@Index("ix_bill_concession_student", ["studentId"])
@Check("ck_bill_concession_kind", `"kind" IN ('WAIVER','DISCOUNT','SCHOLARSHIP','BURSARY')`)
@Check("ck_bill_concession_status", `"status" IN ('PENDING_APPROVAL','APPROVED','POSTED','REJECTED')`)
@Check("ck_bill_concession_amount_positive", `"amount" > 0`)
export class BillConcessionEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 12, name: "kind" })
  kind!: BillConcessionKind;

  @Column({ type: "uuid", name: "scheme_id", nullable: true })
  schemeId!: string | null;

  @ManyToOne(() => BillConcessionSchemeEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "scheme_id" })
  scheme?: BillConcessionSchemeEntity | null;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "uuid", name: "invoice_id", nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => BillInvoiceEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity | null;

  @Column({ type: "uuid", name: "invoice_line_id", nullable: true })
  invoiceLineId!: string | null;

  @ManyToOne(() => BillInvoiceLineEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_line_id" })
  invoiceLine?: BillInvoiceLineEntity | null;

  @Column({ type: "uuid", name: "sponsor_award_id", nullable: true })
  sponsorAwardId!: string | null;

  @ManyToOne(() => BillSponsorAwardEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "sponsor_award_id" })
  sponsorAward?: BillSponsorAwardEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "text", name: "reason" })
  reason!: string;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BillConcessionStatus;

  /** Loose uuid, no FK — `platform/approvals` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}
