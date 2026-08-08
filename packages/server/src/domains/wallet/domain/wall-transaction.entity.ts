import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/payments`' barrel —
// same circular-require-avoidance discipline already established throughout
// this codebase (see `PayReceiptAllocationEntity`'s import comment in
// `domains/payments/domain/pay-receipt-allocation.entity.ts`).
import { PayReceiptEntity } from "../../payments/domain/pay-receipt.entity";
import { WallServicePointEntity } from "./wall-service-point.entity";
import { WallWalletEntity } from "./wall-wallet.entity";

export type WallTransactionType =
  | "TOPUP"
  | "SPEND"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "FEE_TRANSFER"
  | "REFUND"
  | "ADJUSTMENT";
export const WALL_TRANSACTION_TYPES: readonly WallTransactionType[] = [
  "TOPUP",
  "SPEND",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "FEE_TRANSFER",
  "REFUND",
  "ADJUSTMENT",
];

export type WallTransactionDirection = "D" | "C";

/**
 * Maps to `wall_transaction` (docs/phase-4/03-schema-student-finance.md §5)
 * — the append-only ledger of every wallet movement (P-13..P-17). Plain
 * `BaseEntity` (never updated after insert), same treatment as
 * `gl_journal_line`/`pay_receipt_split` — `WalletTransactionsService` never
 * calls `.save()` on an existing row of this entity, only `.create()`.
 *
 * `balance_after` is the audit-visible running balance immediately after
 * this transaction applied — written once at insert time from the wallet's
 * own locked `balance` column, the same "point-in-time snapshot, never
 * recomputed" pattern `pay_receipt.balance_after` uses.
 *
 * `journal_id` is NOT NULL — every wallet transaction posts exactly one
 * balanced GL journal via `PostingService.post()` atomically with this row
 * (mirrors `pay_receipt.journal_id`'s "always posted atomically" rationale).
 * `receipt_id` is a real, nullable FK to `pay_receipt` (imported directly
 * from `domains/payments`' entity file) — populated only by the
 * receipt-split-draws-from-wallet integration point (stretch goal; see
 * `wallet-transactions.service.ts`'s class doc comment for whether it was
 * attempted this pass). `counterparty_wallet_id` is the sibling leg of a
 * `transferToWallet()` call (P-17) — self-referencing `wall_wallet`, nullable
 * for every other transaction type.
 */
@Entity("wall_transaction")
@Index("ix_wall_txn_wallet_at", ["walletId", "at"])
@Index("ix_wall_txn_service_point", ["servicePointId", "at"], { where: `"service_point_id" IS NOT NULL` })
@Index("uq_wall_transaction_idempotency_key", ["idempotencyKey"], {
  unique: true,
  where: `"idempotency_key" IS NOT NULL`,
})
@Check(
  "ck_wall_transaction_type",
  `"type" IN ('TOPUP','SPEND','TRANSFER_IN','TRANSFER_OUT','FEE_TRANSFER','REFUND','ADJUSTMENT')`,
)
@Check("ck_wall_transaction_direction", `"direction" IN ('D','C')`)
@Check("ck_wall_transaction_amount_positive", `"amount" > 0`)
export class WallTransactionEntity extends BaseEntity {
  @Column({ type: "uuid", name: "wallet_id" })
  walletId!: string;

  @ManyToOne(() => WallWalletEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "wallet_id" })
  wallet?: WallWalletEntity;

  @Column({ type: "varchar", length: 14, name: "type" })
  type!: WallTransactionType;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "char", length: 1, name: "direction" })
  direction!: WallTransactionDirection;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance_after",
    transformer: RequiredMoneyTransformer,
  })
  balanceAfter!: Money;

  @Column({ type: "uuid", name: "service_point_id", nullable: true })
  servicePointId!: string | null;

  @ManyToOne(() => WallServicePointEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "service_point_id" })
  servicePoint?: WallServicePointEntity | null;

  @Column({ type: "jsonb", name: "items", nullable: true })
  items!: Record<string, unknown> | null;

  @Column({ type: "uuid", name: "counterparty_wallet_id", nullable: true })
  counterpartyWalletId!: string | null;

  @ManyToOne(() => WallWalletEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "counterparty_wallet_id" })
  counterpartyWallet?: WallWalletEntity | null;

  @Column({ type: "uuid", name: "receipt_id", nullable: true })
  receiptId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "receipt_id" })
  receipt?: PayReceiptEntity | null;

  @Column({ type: "uuid", name: "journal_id" })
  journalId!: string;

  @ManyToOne(() => GlJournalEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity;

  /** Loose uuid, no FK — `platform/approvals`' `appr_instance` id for the transfer/refund/adjust threshold-approval gate (BR-WALL-05/FR-WALL-013.1). */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "varchar", length: 20, name: "reason_code", nullable: true })
  reasonCode!: string | null;

  @Column({ type: "varchar", length: 64, name: "idempotency_key", nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: "uuid", name: "actor_id", nullable: true })
  actorId!: string | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;
}
