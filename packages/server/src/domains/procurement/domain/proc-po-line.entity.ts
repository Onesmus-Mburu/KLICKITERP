import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/inventory`'s barrel —
// same circular-require-avoidance discipline every other cross-domain entity
// FK in this codebase follows (see `WallWalletEntity`'s import comment in
// `domains/wallet/domain/wall-wallet.entity.ts`).
import { InvItemEntity } from "../../inventory/domain/inv-item.entity";
import { ProcPurchaseOrderEntity } from "./proc-purchase-order.entity";

/**
 * Maps to `proc_po_line` (docs/phase-4/04-schema-operations.md §2) — one
 * line of a `proc_purchase_order`. Module 12 (Procurement) **foundation pass
 * only**.
 *
 * `MutableBaseEntity` — genuine, explicitly named post-creation update path:
 * `received_qty` is a cached running total (SUM of posted
 * `proc_grn_line.received_qty` across every GRN raised against this PO line)
 * maintained by the next pass's GRN-posting service — it stays at its
 * `DEFAULT 0` throughout this foundation pass, since no application service
 * exists yet to write it. This is a stronger, independent justification on
 * top of the general "parent has a real DRAFT status" argument
 * `proc_requisition_line`/`proc_grn_line`/`proc_voucher_allocation` also
 * rely on.
 *
 * **No DB-level tolerance CHECK here** — the DDL's own comment reads
 * `CHECK (received_qty <= qty * (1 + tolerance handled in svc; hard cap via
 * grn trigger))`, i.e. the DDL itself says the tolerance-aware ceiling is
 * NOT a constraint on this table. The real hard cap lives on
 * `trg_proc_grn_qty_cap` (migration `0100`), which runs against
 * `proc_grn_line` at insert/update time (BR-PROC-03) — this table only gets
 * the unconditional `received_qty >= 0` sanity CHECK.
 *
 * `item_id` is a real, nullable FK to `inv_item` (Module 13/Inventory),
 * closed by migration `0111` — the same gap-closure `proc_requisition_line
 * .item_id`/`proc_quotation_line.item_id` received.
 *
 * `qty`/`received_qty` are physical quantities, not currency — deliberately
 * NOT routed through `MoneyTransformer` (only `unit_price` is money). Left
 * as the raw decimal string Postgres's `pg` driver returns by default for
 * `NUMERIC` columns with no transformer — the same "no float in this path"
 * reasoning `money.transformer.ts`'s own doc comment gives, just without a
 * dedicated `Quantity` value type (none exists in this codebase yet; Module
 * 13/Inventory is the natural place to introduce one if warranted).
 */
@Entity("proc_po_line")
@Check("ck_proc_po_line_qty_positive", `"qty" > 0`)
@Check("ck_proc_po_line_unit_price_nonneg", `"unit_price" >= 0`)
@Check("ck_proc_po_line_received_qty_nonneg", `"received_qty" >= 0`)
export class ProcPoLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "po_id" })
  poId!: string;

  @ManyToOne(() => ProcPurchaseOrderEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "po_id" })
  po?: ProcPurchaseOrderEntity;

  @Column({ type: "int", name: "line_no" })
  lineNo!: number;

  /** Real FK to `inv_item` (Module 13/Inventory), added by migration `0111`. See class doc comment. */
  @Column({ type: "uuid", name: "item_id", nullable: true })
  itemId!: string | null;

  @ManyToOne(() => InvItemEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity | null;

  @Column({ type: "varchar", length: 200, name: "description" })
  description!: string;

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

  @Column({ type: "numeric", precision: 14, scale: 4, name: "received_qty", default: 0 })
  receivedQty!: string;
}
