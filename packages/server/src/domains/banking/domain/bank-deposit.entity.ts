import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/payments`' barrel —
// same circular-require-avoidance discipline this codebase applies to every
// cross-domain FK (see `PayMpesaTransactionEntity`'s import comment for the
// precedent). `domains/payments` was added to `domains/banking`'s
// `mayImport` list (module-deps.json) for this.
import { PayCashierSessionEntity } from "../../payments/domain/pay-cashier-session.entity";
import { BankAccountEntity } from "./bank-account.entity";

export type BankDepositWithdrawalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED";
export const BANK_DEPOSIT_WITHDRAWAL_STATUSES: readonly BankDepositWithdrawalStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
];

/**
 * Maps to `bank_deposit` (docs/phase-4/04-schema-operations.md §5) — a
 * source-till/safe -> bank deposit (FR-BANK-002.1). Module 16 (Banking)
 * **foundation pass only**. See `BankWithdrawalEntity` for the mirror-image
 * table the DDL's own "`bank_deposit` / `bank_withdrawal`" shorthand also
 * produces — two separate physical tables sharing one shape, the exact same
 * treatment `bill_credit_note`/`bill_debit_note` (Module 9) established for
 * an identical shorthand.
 *
 * **Status enum**: the DDL names a `status` column for deposit/withdrawal
 * but states no enum specific to it — reused verbatim from the sibling
 * `bank_transfer.status` CHECK (`DRAFT|PENDING_APPROVAL|APPROVED|POSTED`),
 * the only other approval-chained document shape in this same DDL block. A
 * documented judgement call.
 *
 * **Dual acknowledgment** (FR-BANK-007, the DDL's own inline note):
 * `ack_by_sender`/`ack_by_sender_at` and `ack_by_receiver`/
 * `ack_by_receiver_at` — loose uuid/timestamptz pairs, no FK (the same
 * "column named but carries no `→` arrow in the source DDL" treatment every
 * other loose reference in this codebase gets, e.g. `approval_ref`);
 * populated by the next pass's deposit-confirmation workflow.
 *
 * `MutableBaseEntity` — real status progression, `journal_id` written only
 * at posting, both acknowledgment pairs populated strictly post-creation.
 */
@Entity("bank_deposit")
@Index("uq_bank_deposit_number", ["number"], { unique: true })
@Check("ck_bank_deposit_amount_positive", `"amount" > 0`)
@Check("ck_bank_deposit_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
export class BankDepositEntity extends MutableBaseEntity {
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

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  /** Dual acknowledgment (FR-BANK-007) — loose uuid, no FK. See class doc comment. */
  @Column({ type: "uuid", name: "ack_by_sender", nullable: true })
  ackBySender!: string | null;

  @Column({ type: "timestamptz", name: "ack_by_sender_at", nullable: true })
  ackBySenderAt!: Date | null;

  /** Dual acknowledgment (FR-BANK-007) — loose uuid, no FK. See class doc comment. */
  @Column({ type: "uuid", name: "ack_by_receiver", nullable: true })
  ackByReceiver!: string | null;

  @Column({ type: "timestamptz", name: "ack_by_receiver_at", nullable: true })
  ackByReceiverAt!: Date | null;
}
