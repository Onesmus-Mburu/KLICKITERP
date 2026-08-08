import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { UsrUserEntity } from "../../../platform/users";
// Imported directly from its entity file, not `domains/students`' barrel —
// the same circular-require-avoidance discipline Module 9 (Billing)
// established (see `BillInvoiceEntity`'s import comment in
// `domains/billing/domain/bill-invoice.entity.ts`): going through either
// barrel would eagerly pull in `students.module.ts`'s controllers/services
// as a side effect of loading this entity, and NestJS's
// `@InjectRepository(StdStudentEntity)` needs the class value eagerly
// (unlike TypeORM's `@ManyToOne(() => Entity)` thunks), which produces a
// real "circular dependency detected inside @InjectRepository()" crash.
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { PayCashierSessionEntity } from "./pay-cashier-session.entity";

export type PayReceiptStatus = "POSTED" | "REVERSED";
export const PAY_RECEIPT_STATUSES: readonly PayReceiptStatus[] = ["POSTED", "REVERSED"];

/**
 * Maps to `pay_receipt` (docs/phase-4/03-schema-student-finance.md §4) — the
 * core payment-capture document. Module 10 (Payments) **foundation pass
 * only** (docs/phase-5/PROGRESS.md): entities/repositories/migration/
 * triggers. Application services (cashier receipt capture+posting, P-08
 * through P-11, reversal workflow) land in a later pass.
 *
 * **`MutableBaseEntity` judgement call** (documented per the task brief):
 * `pay_receipt` has no derived-balance-cache column that gets incremented in
 * place the way `bill_invoice.balance` does — `balance_after` is a
 * point-in-time snapshot written once at receipt creation, and `status`
 * only ever flips `POSTED -> REVERSED` exactly once, via the reversal flow
 * (BR-PAY-08: a reversal is a NEW contra receipt referencing this one via
 * `reversal_of_id`, never an in-place edit of the original's financial
 * shape). However `reprint_count` DOES increment in place every time the
 * receipt is reprinted — a real, ordinary post-creation update with no
 * associated status transition — so this entity extends `MutableBaseEntity`
 * rather than the true-append-only `BaseEntity` `gl_journal`/
 * `gl_journal_line` use. The "financial" columns (`total`/`student_id`/
 * `journal_id`/`balance_after`) remain frozen by convention at this layer;
 * `trg_pay_receipt_immutable` (migration `0080`) enforces this at the DB
 * layer, explicitly allowing only `reprint_count` and the one legitimate
 * `status` transition to change.
 *
 * `journal_id` was originally NOT NULL (unlike `bill_invoice.journal_id`) — a
 * receipt was always posted atomically with its GL journal, never left in an
 * unposted/DRAFT state (no `DRAFT` value exists in `status`'s CHECK).
 * **Phase 6 Slice 12 (Part A)**: made nullable (migration `0233`) —
 * `ReceiptsService.recordWalletFundedReceipt()` creates a receipt whose real
 * GL effect already happened via the WALLET module's own journal
 * (`wall_transaction`'s, not this row's), so this is a genuine audit-trail
 * document with no journal of its own, not a second posting. See migration
 * `0233`'s own doc comment for the full reasoning, including why the
 * reversal guard added to `reverseReceipt()` in the same pass is the other
 * required half of this change.
 * `approval_ref` is a loose `uuid` with no FK — the next pass's services
 * will call `ApprovalEngineService` directly for the `PAYMENT_REVERSALS`
 * chain (BR-PAY-08); `platform/approvals` is deliberately not in this
 * module's `mayImport` list at this foundation-pass stage.
 */
@Entity("pay_receipt")
@Index("uq_pay_receipt_number", ["number"], { unique: true })
@Index("ix_pay_receipt_student", ["studentId", "receiptDate"])
@Index("ix_pay_receipt_session", ["sessionId"])
@Index("uq_pay_receipt_idempotency_key", ["idempotencyKey"], {
  unique: true,
  where: `"idempotency_key" IS NOT NULL`,
})
@Check("ck_pay_receipt_status", `"status" IN ('POSTED','REVERSED')`)
@Check("ck_pay_receipt_total_positive", `"total" > 0`)
export class PayReceiptEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "varchar", length: 120, name: "payer_name" })
  payerName!: string;

  @Column({ type: "varchar", length: 20, name: "payer_phone", nullable: true })
  payerPhone!: string | null;

  @Column({ type: "date", name: "receipt_date" })
  receiptDate!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: PayReceiptStatus;

  @Column({ type: "uuid", name: "reversal_of_id", nullable: true })
  reversalOfId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "reversal_of_id" })
  reversalOf?: PayReceiptEntity | null;

  @Column({ type: "varchar", length: 20, name: "reversal_reason", nullable: true })
  reversalReason!: string | null;

  /** Loose uuid, no FK — `platform/approvals` is not in this module's `mayImport` list at this foundation-pass stage. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "cashier_id" })
  cashierId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "cashier_id" })
  cashier?: UsrUserEntity;

  @Column({ type: "uuid", name: "session_id", nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => PayCashierSessionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "session_id" })
  session?: PayCashierSessionEntity | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "varchar", length: 64, name: "idempotency_key", nullable: true })
  idempotencyKey!: string | null;

  /** Point-in-time student balance snapshot for the printed receipt — written once at creation, never recomputed in place. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance_after",
    transformer: RequiredMoneyTransformer,
  })
  balanceAfter!: Money;

  @Column({ type: "int", name: "reprint_count", default: 0 })
  reprintCount!: number;
}
