import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/students`' barrel —
// see `BillFeeStructureEntity`'s import comment for why (avoids a real
// circular-require crash via `students.module.ts`'s controllers/services).
import { StdStudentEntity } from "../../students/domain/std-student.entity";

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
 * `b2c_transaction_id` is a **forward reference to `pay_mpesa_transaction`
 * (Module 10/Payments, doesn't exist yet)** — deliberately a bare `uuid`
 * column with no FK and no `@ManyToOne`, same "forward reference, no FK yet"
 * treatment `std_student.sponsor_id`/`.transport_route_id` received in
 * Module 8 before this pass closed that gap; Module 10 should add the real
 * FK constraint via its own migration once `pay_mpesa_transaction` exists.
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

  /** Forward reference to `pay_mpesa_transaction` (Module 10/Payments) — bare uuid, no FK. See class doc comment. */
  @Column({ type: "uuid", name: "b2c_transaction_id", nullable: true })
  b2cTransactionId!: string | null;
}
