import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/wallet`'s barrel —
// same circular-require-avoidance discipline this codebase applies to every
// cross-domain FK (see `PayReceiptAllocationEntity`'s import comment).
// Closes Module 10's own documented forward-reference gap (migration `0091`,
// see this entity's doc comment below) — `domains/wallet` was added to
// `domains/payments`' `mayImport` list (module-deps.json) for this.
import { WallTransactionEntity } from "../../wallet/domain/wall-transaction.entity";
import { PayReceiptEntity } from "./pay-receipt.entity";

export type PayMpesaTransactionKind = "STK" | "C2B" | "B2C";
export const PAY_MPESA_TRANSACTION_KINDS: readonly PayMpesaTransactionKind[] = ["STK", "C2B", "B2C"];

export type PayMpesaTransactionState = "INITIATED" | "PENDING" | "CONFIRMED" | "FAILED" | "TIMEOUT" | "REVERSED";
export const PAY_MPESA_TRANSACTION_STATES: readonly PayMpesaTransactionState[] = [
  "INITIATED",
  "PENDING",
  "CONFIRMED",
  "FAILED",
  "TIMEOUT",
  "REVERSED",
];

/** States for which `ix_pay_mpesa_state_p`'s partial index applies — the STK pending-fallback sweep (FR-PAY-008.1). */
export const PAY_MPESA_TRANSACTION_OPEN_STATES: readonly PayMpesaTransactionState[] = ["INITIATED", "PENDING"];

/**
 * Maps to `pay_mpesa_transaction` (docs/phase-4/03-schema-student-finance.md
 * §4) — Module 10 (Payments) **foundation pass only**
 * (docs/phase-5/PROGRESS.md). `MutableBaseEntity` — a real post-creation
 * update path: `state` progresses `INITIATED -> PENDING -> CONFIRMED |
 * FAILED | TIMEOUT | REVERSED` as callbacks/status-query fallbacks arrive
 * (FR-PAY-008.1/FR-PAY-009.1), with `raw_callback`/`matched_receipt_id`
 * populated only then, long after the row is first created at
 * initiation/ingestion time with just `raw_request`.
 *
 * `mpesa_ref` carries BR-PAY-06's global-uniqueness invariant ("an M-Pesa
 * transaction reference may be consumed by exactly one receipt") at the DB
 * layer via a partial-safe plain unique index (NULL values — pre-confirmation
 * rows — are never compared equal by Postgres UNIQUE, so multiple
 * not-yet-confirmed rows may coexist without a value here).
 *
 * `wallet_transaction_id` — **real FK to `wall_transaction`**, closed by
 * Module 11 (Wallet)'s migration `0091` once `wall_transaction` existed
 * (`ON DELETE RESTRICT`). Originally (Module 10 foundation pass) this was a
 * bare `uuid` column with no FK — the same "forward reference, no FK yet"
 * treatment `bill_refund_voucher.b2c_transaction_id` received before its own
 * target table existed (see that entity's doc comment in
 * `domains/billing/domain/bill-refund-voucher.entity.ts`, still open as of
 * this note).
 */
@Entity("pay_mpesa_transaction")
@Index("uq_pay_mpesa_ref", ["mpesaRef"], { unique: true })
@Index("uq_pay_mpesa_checkout_request_id", ["checkoutRequestId"], { unique: true })
@Index("uq_pay_mpesa_conversation_id", ["conversationId"], { unique: true })
@Index("ix_pay_mpesa_state_p", ["createdAt"], {
  where: `"state" IN ('INITIATED','PENDING')`,
})
@Index("ix_pay_mpesa_bill_ref", ["billRef"])
@Check("ck_pay_mpesa_transaction_kind", `"kind" IN ('STK','C2B','B2C')`)
@Check("ck_pay_mpesa_transaction_state", `"state" IN ('INITIATED','PENDING','CONFIRMED','FAILED','TIMEOUT','REVERSED')`)
export class PayMpesaTransactionEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 6, name: "kind" })
  kind!: PayMpesaTransactionKind;

  @Column({ type: "varchar", length: 12, name: "shortcode" })
  shortcode!: string;

  @Column({ type: "varchar", length: 20, name: "msisdn_masked" })
  msisdnMasked!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 20, name: "mpesa_ref", nullable: true })
  mpesaRef!: string | null;

  @Column({ type: "varchar", length: 60, name: "checkout_request_id", nullable: true })
  checkoutRequestId!: string | null;

  @Column({ type: "varchar", length: 60, name: "conversation_id", nullable: true })
  conversationId!: string | null;

  @Column({ type: "varchar", length: 60, name: "bill_ref", nullable: true })
  billRef!: string | null;

  @Column({ type: "varchar", length: 15, name: "state" })
  state!: PayMpesaTransactionState;

  @Column({ type: "jsonb", name: "raw_request" })
  rawRequest!: Record<string, unknown>;

  @Column({ type: "jsonb", name: "raw_callback", nullable: true })
  rawCallback!: Record<string, unknown> | null;

  @Column({ type: "uuid", name: "matched_receipt_id", nullable: true })
  matchedReceiptId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "matched_receipt_id" })
  matchedReceipt?: PayReceiptEntity | null;

  @Column({ type: "uuid", name: "wallet_transaction_id", nullable: true })
  walletTransactionId!: string | null;

  @ManyToOne(() => WallTransactionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "wallet_transaction_id" })
  walletTransaction?: WallTransactionEntity | null;
}
