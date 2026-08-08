import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from their entity files, not `domains/banking`'s
// barrel — same circular-require-avoidance discipline every cross-domain FK
// in this codebase follows. `BankChequeLeafEntity` in particular is a
// genuine TWO-FILE mutual import with this file (see
// `bank-cheque-leaf.entity.ts`'s own import comment for why that's safe —
// TypeORM relation targets are lazy thunks). `domains/banking` was added to
// `domains/procurement`'s `mayImport` list (module-deps.json) for this,
// closing this pass's own documented forward-reference gap (migration
// `0142`, see this entity's doc comment below).
import { BankAccountEntity } from "../../banking/domain/bank-account.entity";
import { BankChequeLeafEntity } from "../../banking/domain/bank-cheque-leaf.entity";
import { ProcSupplierEntity } from "./proc-supplier.entity";

export type ProcPaymentVoucherMethod = "BANK" | "CHEQUE" | "MPESA" | "CASH";
export const PROC_PAYMENT_VOUCHER_METHODS: readonly ProcPaymentVoucherMethod[] = [
  "BANK",
  "CHEQUE",
  "MPESA",
  "CASH",
];

export type ProcPaymentVoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "CANCELLED";
export const PROC_PAYMENT_VOUCHER_STATUSES: readonly ProcPaymentVoucherStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PAID",
  "CANCELLED",
];

/**
 * Maps to `proc_payment_voucher` (docs/phase-4/04-schema-operations.md §2)
 * — a supplier payment voucher (FR-PROC-008.1: one or many supplier
 * invoices, less credits). Module 12 (Procurement) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression across the full
 * DRAFT->...->PAID/CANCELLED lifecycle, `journal_id` written at posting
 * (P-21), `remittance_sent` flipped once the remittance advice email goes
 * out (FR-PROC-008.1).
 *
 * `bank_account_id`/`cheque_leaf_id` are **real FKs to `bank_account`/
 * `bank_cheque_leaf`** — closed by Module 16 (Banking)'s own migration
 * `0142` once both tables existed (`ON DELETE RESTRICT`, both columns stay
 * nullable — a `CASH`/`MPESA` voucher has neither). Originally (this
 * foundation pass) these were bare nullable `uuid` columns with no FK — the
 * same "forward reference, no FK yet" treatment `pay_receipt_split.
 * bank_account_id` received before Module 16 existed (closed identically by
 * migration `0141`).
 *
 * `journal_id` is a real FK to `gl_journal` (`accounting`), nullable — only
 * set once posted. `approval_ref` is a loose `uuid`, no FK — same
 * foundation-pass-stage judgement call every other `approval_ref` column in
 * this module makes (`platform/approvals` not yet in `mayImport`).
 */
@Entity("proc_payment_voucher")
@Index("uq_proc_payment_voucher_number", ["number"], { unique: true })
@Check("ck_proc_payment_voucher_method", `"method" IN ('BANK','CHEQUE','MPESA','CASH')`)
@Check(
  "ck_proc_payment_voucher_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')`,
)
@Check("ck_proc_payment_voucher_total_positive", `"total" > 0`)
export class ProcPaymentVoucherEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "supplier_id" })
  supplierId!: string;

  @ManyToOne(() => ProcSupplierEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity;

  @Column({ type: "varchar", length: 10, name: "method" })
  method!: ProcPaymentVoucherMethod;

  /** Real FK to `bank_account` (migration `0142`). See class doc comment. */
  @Column({ type: "uuid", name: "bank_account_id", nullable: true })
  bankAccountId!: string | null;

  @ManyToOne(() => BankAccountEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "bank_account_id" })
  bankAccount?: BankAccountEntity | null;

  /** Real FK to `bank_cheque_leaf` (migration `0142`). See class doc comment. */
  @Column({ type: "uuid", name: "cheque_leaf_id", nullable: true })
  chequeLeafId!: string | null;

  @ManyToOne(() => BankChequeLeafEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cheque_leaf_id" })
  chequeLeaf?: BankChequeLeafEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ProcPaymentVoucherStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "boolean", name: "remittance_sent", default: false })
  remittanceSent!: boolean;
}
