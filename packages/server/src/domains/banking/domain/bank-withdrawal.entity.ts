import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/payments`' barrel —
// see `BankDepositEntity`'s import comment for the precedent.
import { PayCashierSessionEntity } from "../../payments/domain/pay-cashier-session.entity";
import { BankAccountEntity } from "./bank-account.entity";
import { BankDepositWithdrawalStatus } from "./bank-deposit.entity";

/**
 * Maps to `bank_withdrawal` (docs/phase-4/04-schema-operations.md §5) — the
 * mirror-image table of `bank_deposit` (see that entity's doc comment for
 * the full "`bank_deposit` / `bank_withdrawal`" shorthand rationale,
 * status-enum judgement call, and dual-acknowledgment note — all identical
 * here). Module 16 (Banking) **foundation pass only**.
 */
@Entity("bank_withdrawal")
@Index("uq_bank_withdrawal_number", ["number"], { unique: true })
@Check("ck_bank_withdrawal_amount_positive", `"amount" > 0`)
@Check("ck_bank_withdrawal_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
export class BankWithdrawalEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: BankAccountEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 60, name: "slip_ref", nullable: true })
  slipRef!: string | null;

  @Column({ type: "uuid", name: "source_session_id", nullable: true })
  sourceSessionId!: string | null;

  @ManyToOne(() => PayCashierSessionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "source_session_id" })
  sourceSession?: PayCashierSessionEntity | null;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BankDepositWithdrawalStatus;

  /** Loose uuid, no FK — see `BankDepositEntity`'s class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  /** Dual acknowledgment (FR-BANK-007) — loose uuid, no FK. See `BankDepositEntity`'s class doc comment. */
  @Column({ type: "uuid", name: "ack_by_sender", nullable: true })
  ackBySender!: string | null;

  @Column({ type: "timestamptz", name: "ack_by_sender_at", nullable: true })
  ackBySenderAt!: Date | null;

  /** Dual acknowledgment (FR-BANK-007) — loose uuid, no FK. See `BankDepositEntity`'s class doc comment. */
  @Column({ type: "uuid", name: "ack_by_receiver", nullable: true })
  ackByReceiver!: string | null;

  @Column({ type: "timestamptz", name: "ack_by_receiver_at", nullable: true })
  ackByReceiverAt!: Date | null;
}
