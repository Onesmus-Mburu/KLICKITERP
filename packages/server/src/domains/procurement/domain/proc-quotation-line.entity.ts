import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/inventory`'s barrel —
// same circular-require-avoidance discipline every other cross-domain entity
// FK in this codebase follows (see `WallWalletEntity`'s import comment in
// `domains/wallet/domain/wall-wallet.entity.ts`).
import { InvItemEntity } from "../../inventory/domain/inv-item.entity";
import { ProcQuotationEntity } from "./proc-quotation.entity";

/**
 * Maps to `proc_quotation_line` (docs/phase-4/04-schema-operations.md §2) —
 * one priced line of a `proc_quotation`. Module 12 (Procurement)
 * **foundation pass only**.
 *
 * **Base-class judgement call (documented divergence)**: plain `BaseEntity`
 * (append-only), NOT `MutableBaseEntity` — unlike `proc_requisition_line`,
 * `proc_quotation` carries **no `status`/`DRAFT` lifecycle column at all**
 * (only the `is_awarded` bool), so a quotation and its lines represent a
 * captured, point-in-time record of what a supplier quoted, written
 * atomically at data-entry time with no pre-existing row for a line to ever
 * legitimately edit afterwards — the exact same shape `pay_receipt_split`
 * diverged to `BaseEntity` for (its parent `pay_receipt` also has no `DRAFT`
 * state), not `bill_invoice_line`'s "freely edited while parent is DRAFT"
 * story.
 *
 * **Column shape judgement call**: the DDL's shorthand `(item ref, qty,
 * unit_price)` is under-specified. Modeled to mirror `proc_po_line`'s shape
 * (`item_id`/`description`/`qty`/`unit_price`) since PO lines are typically
 * generated directly from the awarded quotation's lines by the next pass's
 * PO-creation service — keeping the two line shapes structurally
 * copy-compatible. `item_id` is a real, nullable FK to `inv_item` (Module
 * 13/Inventory), closed by migration `0111` — the same gap-closure
 * `proc_requisition_line.item_id`/`proc_po_line.item_id` received.
 */
@Entity("proc_quotation_line")
@Check("ck_proc_quotation_line_qty_positive", `"qty" > 0`)
@Check("ck_proc_quotation_line_unit_price_nonneg", `"unit_price" >= 0`)
export class ProcQuotationLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "quotation_id" })
  quotationId!: string;

  @ManyToOne(() => ProcQuotationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: ProcQuotationEntity;

  /** Real FK to `inv_item` (Module 13/Inventory), added by migration `0111`. See class doc comment. */
  @Column({ type: "uuid", name: "item_id", nullable: true })
  itemId!: string | null;

  @ManyToOne(() => InvItemEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity | null;

  @Column({ type: "varchar", length: 200, name: "description" })
  description!: string;

  /** Physical quantity, not currency — no Money transformer. See `proc-po-line.entity.ts`'s doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "qty" })
  qty!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "unit_price",
    transformer: RequiredMoneyTransformer,
  })
  unitPrice!: Money;
}
