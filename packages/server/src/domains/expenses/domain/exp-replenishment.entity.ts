import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { ExpPettyCashFloatEntity } from "./exp-petty-cash-float.entity";

export type ExpReplenishmentStatus = "PENDING_APPROVAL" | "APPROVED" | "PAID";
export const EXP_REPLENISHMENT_STATUSES: readonly ExpReplenishmentStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PAID",
];

/**
 * Maps to `exp_replenishment` (docs/phase-4/04-schema-operations.md §4) — a
 * request to top up a custodian's `exp_petty_cash_float` back up (at most)
 * to its `ceiling`, listing every `exp_petty_cash_voucher` spent since the
 * last replenishment (FR-EXP-003.1: "replenishment request lists vouchers
 * since last replenishment; approval → P-26 for the spent total"). Module 14
 * (Expenses) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression
 * PENDING_APPROVAL->APPROVED->PAID, `journal_id` written only at posting.
 * Note this DDL-given enum has no `DRAFT`/`CANCELLED` — a replenishment
 * request is generated directly in `PENDING_APPROVAL` from the accumulated
 * voucher total (not hand-authored like `exp_voucher`), per the task
 * brief's own literal `CK(PENDING_APPROVAL|APPROVED|PAID)`.
 *
 * `voucher_ids uuid[]` — a plain Postgres array column listing the
 * `exp_petty_cash_voucher` rows this replenishment covers. A Postgres array
 * cannot carry a real FK constraint, so this stays a loose array regardless
 * of `exp_petty_cash_voucher` being a sibling table in this same module —
 * the exact same structural limitation `InvItemEntity.preferredSupplierIds`/
 * `appr_level.user_ids` document, per the task brief's own explicit
 * instruction.
 *
 * `float_id` is a required FK to `exp_petty_cash_float` (`ON DELETE
 * RESTRICT`). `approval_ref` stays a loose `uuid` with no FK — same
 * reasoning `ExpVoucherEntity.approvalRef`'s doc comment gives (no entity in
 * this codebase ever takes a real FK to `appr_instance`). `journal_id` is a
 * nullable FK to `gl_journal` (`accounting`), populated only once P-26
 * posts.
 */
@Entity("exp_replenishment")
@Check("ck_exp_replenishment_status", `"status" IN ('PENDING_APPROVAL','APPROVED','PAID')`)
@Check("ck_exp_replenishment_amount_positive", `"amount" > 0`)
export class ExpReplenishmentEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "float_id" })
  floatId!: string;

  @ManyToOne(() => ExpPettyCashFloatEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "float_id" })
  float?: ExpPettyCashFloatEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  /** Loose uuid[], no FK possible on a Postgres array — see class doc comment. */
  @Column({ type: "uuid", name: "voucher_ids", array: true })
  voucherIds!: string[];

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: ExpReplenishmentStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}
