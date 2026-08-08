import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Direct entity-file import — same circular-require-avoidance discipline
// every cross-domain FK in this codebase follows (see
// `BillStudentCreditEntity`'s identical comment).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { BillInvoiceEntity } from "./bill-invoice.entity";

export type BillStudentCreditEntryType = "ISSUE" | "CONSUME";
export const BILL_STUDENT_CREDIT_ENTRY_TYPES: readonly BillStudentCreditEntryType[] = ["ISSUE", "CONSUME"];

/**
 * Maps to `bill_student_credit_entry` (migration `0236`) — Phase 6 Slice 12
 * (Part D). The append-only ledger backing `bill_student_credit.balance`,
 * mirroring `wall_transaction`'s own field SHAPE at Billing's smaller scale
 * (per the plan's explicit instruction — borrow Wallet's ledger-row shape,
 * not Wallet's whole module pattern). Plain `BaseEntity` (never updated
 * after insert) — same treatment `wall_transaction`/`gl_journal_line`/
 * `pay_receipt_split` get, for the identical reason: nothing in
 * `StudentCreditService` ever calls `.save()` on an existing row of this
 * entity, only `.create()`.
 *
 * `type='ISSUE'` — a `captureReceipt()` overpayment
 * (`pay_receipt_allocation.to_prepayment=true`) banked as credit for the
 * first time. `type='CONSUME'` — either credit applied to an invoice
 * (`applyStudentCreditToInvoices()`) or a wrongly-issued credit clawed back
 * on a receipt reversal (`StudentCreditService.netOutIssuedCredit()`) — both
 * DECREASE the balance, `amount` is always positive (`ck_..._amount_positive`),
 * `type` alone carries the direction (no negative amounts, ever).
 *
 * **`receipt_id` — bare FK column, real DB constraint, deliberately NO
 * entity relation.** Unlike `pay_mpesa_transaction.wallet_transaction_id`/
 * `pay_receipt_split.bank_account_id` (both started as bare "target table
 * doesn't exist yet" forward references and later grew a real `@ManyToOne`
 * once their referencing module's `mayImport` list was extended), this one
 * is PERMANENT: `pay_receipt` already exists, but `domains/billing` may
 * NOT — ever — import `domains/payments` (`module-deps.json`'s
 * one-directional boundary; `domains/payments` already imports
 * `domains/billing`, so the reverse would be a real module-dependency
 * cycle). See migration `0236`'s own doc comment for the full reasoning.
 * The database still enforces real referential integrity (`FOREIGN KEY ...
 * REFERENCES app.pay_receipt(id) ON DELETE RESTRICT`); only the
 * TypeORM-navigable relation (and the `PayReceiptEntity` entity-file import
 * it would require) is absent, permanently, by design.
 *
 * `invoice_id` is same-domain (`bill_invoice`), so it gets a normal real
 * `@ManyToOne` relation with no such restriction — nullable, since an
 * `ISSUE` entry and a reversal `CONSUME` entry both carry no specific
 * invoice (only `applyStudentCreditToInvoices()`'s own aggregate `CONSUME`
 * entry could theoretically tie to one, but since that call can span
 * MULTIPLE invoices in one entry — mirroring `wall_transaction`'s own
 * "one aggregate row per multi-invoice sweep" shape — it leaves this null
 * too, same as `pay_receipt_allocation` rows carry the real per-invoice
 * detail instead).
 */
@Entity("bill_student_credit_entry")
@Index("ix_bill_student_credit_entry_student_created", ["studentId", "createdAt"])
@Check("ck_bill_student_credit_entry_type", `"type" IN ('ISSUE','CONSUME')`)
@Check("ck_bill_student_credit_entry_amount_positive", `"amount" > 0`)
@Check("ck_bill_student_credit_entry_balance_after_nonneg", `"balance_after" >= 0`)
export class BillStudentCreditEntryEntity extends BaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "varchar", length: 7, name: "type" })
  type!: BillStudentCreditEntryType;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  /** Point-in-time `bill_student_credit.balance` snapshot immediately after this entry applied — same "written once, never recomputed" convention `pay_receipt.balance_after`/`wall_transaction.balance_after` both use. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance_after",
    transformer: RequiredMoneyTransformer,
  })
  balanceAfter!: Money;

  /** Bare FK column — see class doc comment "receipt_id — bare FK column". */
  @Column({ type: "uuid", name: "receipt_id", nullable: true })
  receiptId!: string | null;

  @Column({ type: "uuid", name: "invoice_id", nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => BillInvoiceEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity | null;
}
