import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { FileObjectEntity } from "../../../platform/files";
import { ExpCategoryEntity } from "./exp-category.entity";
import { ExpPettyCashFloatEntity } from "./exp-petty-cash-float.entity";

/**
 * **Status-enum design decision** (the DDL leaves this unspecified beyond
 * "status"): `DRAFT|PENDING_APPROVAL|APPROVED|CANCELLED` — mirrors
 * `exp_voucher`'s own enum minus `PAID`. Rationale: a petty cash voucher is
 * spent directly FROM the custodian's float balance the moment it is
 * approved (BR-EXP-02 — "petty cash vouchers cannot exceed the custodian's
 * current float balance"), there is no separate later "payment" step the
 * way an ordinary `exp_voucher`/`proc_payment_voucher` has (those select a
 * `method` and get paid out through a bank/cheque/M-Pesa channel days after
 * approval) — `APPROVED` already *is* this document's terminal financial
 * state, so a distinct `PAID` status would be meaningless here. Documented
 * per the task brief's own instruction to design and document this enum.
 */
export type ExpPettyCashVoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "CANCELLED";
export const EXP_PETTY_CASH_VOUCHER_STATUSES: readonly ExpPettyCashVoucherStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "CANCELLED",
];

/**
 * Maps to `exp_petty_cash_voucher` (docs/phase-4/04-schema-operations.md §4)
 * — a single petty cash spend against a custodian's `exp_petty_cash_float`
 * (FR-EXP-003.1). Module 14 (Expenses) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression
 * DRAFT->PENDING_APPROVAL->APPROVED/CANCELLED (see the status-enum design
 * decision documented on the type above), `journal_id` written only at
 * posting.
 *
 * `float_id`/`category_id` are required FKs (`exp_petty_cash_float`/
 * `exp_category`, `ON DELETE RESTRICT`). `receipt_file_id` is a nullable FK
 * to `file_object` (`platform/files`, imported via its index.ts barrel per
 * `crossSiblingImportPolicy`) — `RESTRICT`, so a receipt still referenced by
 * a voucher can't be hard-deleted out from under it, the same treatment
 * `BrndThemeEntity.logoFileId` established (chosen over
 * `ProcQuotationEntity.documentFileId`'s `SET NULL` precedent because a
 * petty cash receipt is compliance evidence for a specific spend, not an
 * optional attachment — losing the link silently would defeat the point of
 * requiring one).
 */
@Entity("exp_petty_cash_voucher")
@Index("uq_exp_petty_cash_voucher_number", ["number"], { unique: true })
@Check(
  "ck_exp_petty_cash_voucher_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','CANCELLED')`,
)
@Check("ck_exp_petty_cash_voucher_amount_positive", `"amount" > 0`)
export class ExpPettyCashVoucherEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "float_id" })
  floatId!: string;

  @ManyToOne(() => ExpPettyCashFloatEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "float_id" })
  float?: ExpPettyCashFloatEntity;

  @Column({ type: "uuid", name: "category_id" })
  categoryId!: string;

  @ManyToOne(() => ExpCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: ExpCategoryEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "uuid", name: "receipt_file_id", nullable: true })
  receiptFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "receipt_file_id" })
  receiptFile?: FileObjectEntity | null;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ExpPettyCashVoucherStatus;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}
