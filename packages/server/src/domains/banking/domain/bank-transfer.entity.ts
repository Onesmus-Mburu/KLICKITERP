import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { BankAccountEntity } from "./bank-account.entity";

export type BankTransferStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED";
export const BANK_TRANSFER_STATUSES: readonly BankTransferStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
];

/**
 * Maps to `bank_transfer` (docs/phase-4/04-schema-operations.md §5) — an
 * inter-account transfer, posted as two legs via a transfer clearing account
 * (BR-BANK-01, P-32, next pass). Module 16 (Banking) **foundation pass
 * only**.
 *
 * `MutableBaseEntity` — real status progression `DRAFT -> ... -> POSTED`,
 * `journal_id` written only once posted.
 *
 * `CHECK ck_bank_transfer_accounts_distinct` enforces the DDL's own
 * "`to_account_id` ≠ `from_account_id`" rule directly at the DB layer —
 * BR-BANK-01's atomic-both-legs invariant itself (the clearing account
 * netting to zero per transfer) is a service-layer posting concern for the
 * next pass, not something a single-row CHECK can express.
 *
 * `approval_ref` is a loose uuid, no FK — `platform/approvals` is listed in
 * this foundation pass's `mayImport` for parity/forward-looking readiness
 * only (same judgement call every other module this size has made); no
 * entity anywhere in this codebase ever takes a real FK to `appr_instance`.
 */
@Entity("bank_transfer")
@Index("uq_bank_transfer_number", ["number"], { unique: true })
@Check("ck_bank_transfer_amount_positive", `"amount" > 0`)
@Check("ck_bank_transfer_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
@Check("ck_bank_transfer_accounts_distinct", `"from_account_id" <> "to_account_id"`)
export class BankTransferEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "from_account_id" })
  fromAccountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "from_account_id" })
  fromAccount?: BankAccountEntity;

  @Column({ type: "uuid", name: "to_account_id" })
  toAccountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "to_account_id" })
  toAccount?: BankAccountEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BankTransferStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}
