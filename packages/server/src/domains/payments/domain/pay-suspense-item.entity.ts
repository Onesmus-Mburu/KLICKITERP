import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../../platform/users";
import { PayReceiptEntity } from "./pay-receipt.entity";

export type PaySuspenseItemSource = "C2B" | "BANK" | "OTHER";
export const PAY_SUSPENSE_ITEM_SOURCES: readonly PaySuspenseItemSource[] = ["C2B", "BANK", "OTHER"];

export type PaySuspenseItemState = "OPEN" | "MATCHED" | "REFUNDED";
export const PAY_SUSPENSE_ITEM_STATES: readonly PaySuspenseItemState[] = ["OPEN", "MATCHED", "REFUNDED"];

/**
 * Maps to `pay_suspense_item` (docs/phase-4/03-schema-student-finance.md §4)
 * — unmatched inbound funds parked here per BR-PAY-07 ("unmatched C2B
 * payments live in suspense — visible, reportable, and resolvable only by
 * matching to a student or by an approval-gated refund; suspense may never
 * be silently written off"). Module 10 (Payments) **foundation pass only**
 * (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — a real post-creation update path: `state`
 * progresses `OPEN -> MATCHED | REFUNDED` (FR-PAY-009.1's manual match
 * screen), with `resolved_receipt_id`/`resolved_by`/`resolved_at`/
 * `resolution_note` populated only at that later resolution event.
 *
 * `resolved_by` is a real FK to `usr_user` per the task's cross-module FK
 * policy ("actor_id-equivalents").
 *
 * `ix_pay_suspense_open_p` (BR-PAY-07's suspense digest) is a partial index
 * on `received_at` `WHERE state='OPEN'`.
 */
@Entity("pay_suspense_item")
@Index("ix_pay_suspense_open_p", ["receivedAt"], { where: `"state" = 'OPEN'` })
@Check("ck_pay_suspense_item_source", `"source" IN ('C2B','BANK','OTHER')`)
@Check("ck_pay_suspense_item_state", `"state" IN ('OPEN','MATCHED','REFUNDED')`)
@Check("ck_pay_suspense_item_amount_positive", `"amount" > 0`)
export class PaySuspenseItemEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 10, name: "source" })
  source!: PaySuspenseItemSource;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 60, name: "external_ref" })
  externalRef!: string;

  @Column({ type: "jsonb", name: "raw" })
  raw!: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "received_at" })
  receivedAt!: Date;

  @Column({ type: "varchar", length: 10, name: "state" })
  state!: PaySuspenseItemState;

  @Column({ type: "uuid", name: "resolved_receipt_id", nullable: true })
  resolvedReceiptId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "resolved_receipt_id" })
  resolvedReceipt?: PayReceiptEntity | null;

  @Column({ type: "uuid", name: "resolved_by", nullable: true })
  resolvedBy!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "resolved_by" })
  resolvedByUser?: UsrUserEntity | null;

  @Column({ type: "timestamptz", name: "resolved_at", nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: "text", name: "resolution_note", nullable: true })
  resolutionNote!: string | null;
}
