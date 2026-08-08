import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PayReceiptEntity } from "./pay-receipt.entity";
import { PayChequeEntity } from "./pay-cheque.entity";
import { PayMpesaTransactionEntity } from "./pay-mpesa-transaction.entity";
// Imported directly from its entity file, not `domains/banking`'s barrel —
// same circular-require-avoidance discipline this codebase applies to every
// cross-domain FK (see `PayMpesaTransactionEntity`'s own `WallTransactionEntity`
// import comment for the precedent). Closes Module 10's own documented
// forward-reference gap (migration `0141`, see this entity's doc comment
// below) — `domains/banking` was added to `domains/payments`' `mayImport`
// list (module-deps.json) for this.
import { BankAccountEntity } from "../../banking/domain/bank-account.entity";

export type PayReceiptSplitMethod =
  | "CASH"
  | "BANK"
  | "CHEQUE"
  | "CARD"
  | "POS"
  | "MPESA_STK"
  | "MPESA_C2B"
  | "MPESA_TILL"
  | "WALLET"
  | "BANK_TRANSFER"
  | "CREDIT_BALANCE";
export const PAY_RECEIPT_SPLIT_METHODS: readonly PayReceiptSplitMethod[] = [
  "CASH",
  "BANK",
  "CHEQUE",
  "CARD",
  "POS",
  "MPESA_STK",
  "MPESA_C2B",
  "MPESA_TILL",
  "WALLET",
  "BANK_TRANSFER",
  "CREDIT_BALANCE",
];

/**
 * Maps to `pay_receipt_split` (docs/phase-4/03-schema-student-finance.md §4)
 * — one payment-method line of a `pay_receipt`. Module 10 (Payments)
 * **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * **Base-class judgement call** (documented per the task brief, which asked
 * to match `bill_invoice_line`'s precedent "unless there's reason to
 * diverge"): every "line" entity in `domains/billing` — including
 * `bill_invoice_line`, whose parent `bill_invoice` genuinely progresses
 * through a `DRAFT` status with pre-POSTED edits — extends
 * `MutableBaseEntity`. `pay_receipt`, by contrast, has **no `DRAFT` status
 * at all** (`status` CHECK is only `POSTED|REVERSED`): a receipt and all its
 * splits are written atomically in one transaction at capture time (the next
 * pass's receipt-posting service), with no pre-existing row for a split to
 * ever legitimately edit — the DDL names no column here that is written
 * after the initial INSERT. That is a materially different shape from every
 * billing "line" table's "freely edited while the parent sits in DRAFT"
 * story, so this table is a genuine divergence to plain `BaseEntity`
 * (append-only, same treatment as `gl_journal_line`) rather than following
 * `bill_invoice_line`'s precedent by default.
 *
 * `bank_account_id` is a **real FK to `bank_account`** — closed by Module 16
 * (Banking)'s migration `0141` once `bank_account` existed (`ON DELETE
 * RESTRICT`). Originally (Module 10 foundation pass) this was a bare `uuid`
 * column with no FK — the same "forward reference, no FK yet" treatment
 * `pay_mpesa_transaction.wallet_transaction_id` received before its own
 * target table existed (closed by Module 11's migration `0091`).
 *
 * `trg_pay_splits_sum` (migration `0080`, BR-PAY-01) is a `DEFERRABLE
 * INITIALLY DEFERRED` constraint trigger asserting `SUM(amount)` for the
 * affected `receipt_id` equals that receipt's `total` at COMMIT.
 *
 * `'CREDIT_BALANCE'` (migration `0234`, Phase 6 Slice 12 Part D) — same
 * "declared well before it's ever actually produced" precedent `'WALLET'`
 * itself set (declared here since the Module 10 foundation pass, first
 * produced by a real receipt only in Phase 6 Slice 12 Part A): a receipt
 * created by `ReceiptsService.applyStudentCreditToInvoices()`, applying a
 * student's Credit Balance (`bill_student_credit`, FR-PAY-004) against one
 * or more invoices. UNLIKE `'WALLET'`, a `CREDIT_BALANCE` receipt carries a
 * REAL, non-null `journal_id` — it posts a genuinely new GL journal (the
 * documented, never-implemented-until-now `P-10` posting: debit
 * `PREPAYMENT`, credit `AR_STUDENT`), not a null-journal audit record, since
 * the credit balance itself has no journal of its own the way a wallet's
 * `wall_transaction` does.
 */
@Entity("pay_receipt_split")
@Check(
  "ck_pay_receipt_split_method",
  `"method" IN ('CASH','BANK','CHEQUE','CARD','POS','MPESA_STK','MPESA_C2B','MPESA_TILL','WALLET','BANK_TRANSFER','CREDIT_BALANCE')`,
)
@Check("ck_pay_receipt_split_amount_positive", `"amount" > 0`)
export class PayReceiptSplitEntity extends BaseEntity {
  @Column({ type: "uuid", name: "receipt_id" })
  receiptId!: string;

  @ManyToOne(() => PayReceiptEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "receipt_id" })
  receipt?: PayReceiptEntity;

  @Column({ type: "varchar", length: 12, name: "method" })
  method!: PayReceiptSplitMethod;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  /** Real FK to `bank_account` (migration `0141`). See class doc comment. */
  @Column({ type: "uuid", name: "bank_account_id", nullable: true })
  bankAccountId!: string | null;

  @ManyToOne(() => BankAccountEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "bank_account_id" })
  bankAccount?: BankAccountEntity | null;

  @Column({ type: "uuid", name: "cheque_id", nullable: true })
  chequeId!: string | null;

  @ManyToOne(() => PayChequeEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cheque_id" })
  cheque?: PayChequeEntity | null;

  @Column({ type: "uuid", name: "mpesa_transaction_id", nullable: true })
  mpesaTransactionId!: string | null;

  @ManyToOne(() => PayMpesaTransactionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "mpesa_transaction_id" })
  mpesaTransaction?: PayMpesaTransactionEntity | null;

  @Column({ type: "varchar", length: 60, name: "external_ref", nullable: true })
  externalRef!: string | null;
}
