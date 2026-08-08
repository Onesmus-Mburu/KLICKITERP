import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { InvItemEntity } from "./inv-item.entity";
import { InvTransferEntity } from "./inv-transfer.entity";

/**
 * Maps to `inv_transfer_line` (docs/phase-4/04-schema-operations.md §3,
 * the DDL's inline "+ lines (item, qty, unit_cost)" shorthand) — one line
 * of an `inv_transfer`. Module 13 (Inventory) **foundation pass only**.
 *
 * **Base-class judgement call**: plain `BaseEntity` (append-only), NOT
 * `MutableBaseEntity` — a transfer's lines are captured atomically at
 * `ISSUED` time (the DDL gives `inv_transfer` no `DRAFT` status; its
 * lifecycle starts directly at `ISSUED`), with no free pre-issue edit
 * window for a clerk to revise quantities/costs the way `proc_requisition_line`
 * enjoys while its parent sits in `DRAFT`. This is the same shape
 * `proc_quotation_line`/`pay_receipt_split` diverged to `BaseEntity` for —
 * a point-in-time record of what was issued, not a working draft.
 *
 * `qty`/`unit_cost` are physical-quantity/weighted-average-cost fields, not
 * ordinary money — see `InvItemEntity`'s doc comment for the codebase-wide
 * `NUMERIC(14,4)`-qty / `NUMERIC(18,6)`-cost precision reasoning (`unit_cost`
 * here mirrors `InvMovementEntity.unitCost`'s NOT-Money-transformed
 * treatment exactly, since a transfer line's cost carries the same
 * weighted-average precision through to the `TRANSFER_OUT`/`TRANSFER_IN`
 * movement pair the next pass's engine will write).
 */
@Entity("inv_transfer_line")
@Check("ck_inv_transfer_line_qty_positive", `"qty" > 0`)
export class InvTransferLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "transfer_id" })
  transferId!: string;

  @ManyToOne(() => InvTransferEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "transfer_id" })
  transfer?: InvTransferEntity;

  @Column({ type: "int", name: "line_no" })
  lineNo!: number;

  @Column({ type: "uuid", name: "item_id" })
  itemId!: string;

  @ManyToOne(() => InvItemEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity;

  /** Physical quantity, not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "qty" })
  qty!: string;

  /** NUMERIC(18,6), deliberately NOT Money-transformed — see class doc comment. */
  @Column({ type: "numeric", precision: 18, scale: 6, name: "unit_cost" })
  unitCost!: string;
}
