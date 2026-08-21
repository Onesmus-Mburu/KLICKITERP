import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";
// Same direct-entity-file-import discipline as StdStudentEntity above (and
// every domains/billing entity that references it) — never `domains/payments`'
// barrel, which would eagerly pull in `PaymentsModule`/its controllers and
// create a genuine circular-require crash, since `PaymentsModule` already
// imports `BillingModule` at the full module level (`payments.module.ts`).
// See module-deps.json's `domains/billing` entry for the full rationale.
import { PayMpesaTransactionEntity } from "../../payments/domain/pay-mpesa-transaction.entity";

export type BillRefundMethod = "CASH" | "BANK" | "MPESA_B2C";
export const BILL_REFUND_METHODS: readonly BillRefundMethod[] = ["CASH", "BANK", "MPESA_B2C"];

export type BillRefundVoucherStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "APPROVED_UNPAID"
  | "PAID"
  | "CANCELLED";
export const BILL_REFUND_VOUCHER_STATUSES: readonly BillRefundVoucherStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "APPROVED_UNPAID",
  "PAID",
  "CANCELLED",
];

/**
 * Maps to `bill_refund_voucher` (docs/phase-4/03-schema-student-finance.md
 * §3) — BR-BILL-12 ("a refund may be paid only from an actual credit
 * balance, never creating a negative receivable"). `MutableBaseEntity` — a
 * real post-creation update path: `status` progresses through
 * `DRAFT -> PENDING_APPROVAL -> APPROVED -> (APPROVED_UNPAID |
 * PAID) -> CANCELLED`, with `journal_id`/`b2c_transaction_id` populated only
 * once posted/paid.
 *
 * `b2c_transaction_id` is now a real FK to `pay_mpesa_transaction`
 * (migration `0243`, closing the forward-reference gap this doc comment
 * used to describe — `pay_mpesa_transaction` didn't exist when `bill_*` was
 * first built, same situation `std_student.sponsor_id`/`.transport_route_id`
 * were in before Module 9 closed that gap, migration `0071`).
 * `payee` (jsonb) is an opaque payee-details bag (name/account/phone,
 * method-dependent shape) interpreted by the next pass's refund service.
 */
@Entity("bill_refund_voucher")
@Index("uq_bill_refund_voucher_number", ["number"], { unique: true })
@Check("ck_bill_refund_voucher_method", `"method" IN ('CASH','BANK','MPESA_B2C')`)
@Check(
  "ck_bill_refund_voucher_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','APPROVED_UNPAID','PAID','CANCELLED')`,
)
@Check("ck_bill_refund_voucher_amount_positive", `"amount" > 0`)
export class BillRefundVoucherEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 10, name: "method" })
  method!: BillRefundMethod;

  @Column({ type: "jsonb", name: "payee", default: {} })
  payee!: Record<string, unknown>;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BillRefundVoucherStatus;

  /** Loose uuid, no FK — `platform/approvals` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "uuid", name: "b2c_transaction_id", nullable: true })
  b2cTransactionId!: string | null;

  @ManyToOne(() => PayMpesaTransactionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "b2c_transaction_id" })
  b2cTransaction?: PayMpesaTransactionEntity | null;
}
