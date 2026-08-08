import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { GlAccountEntity } from "../../../accounting";
import { InvCategoryEntity } from "./inv-category.entity";

export type InvItemType = "STOCK" | "CONSUMABLE" | "SERVICE" | "RESALE";
export const INV_ITEM_TYPES: readonly InvItemType[] = ["STOCK", "CONSUMABLE", "SERVICE", "RESALE"];

/**
 * Maps to `inv_item` (docs/phase-4/04-schema-operations.md §3) — the item
 * master. Module 13 (Inventory) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing throughout the item's
 * life: pricing/reorder policy changes, `is_active` deactivation,
 * `avg_cost` is the weighted-average-cost cache recalculated by the next
 * pass's stock-movement engine on every RECEIPT (FR-INV-006.1:
 * `new_avg = (on_hand_value + receipt_value) / (on_hand_qty + receipt_qty)`).
 *
 * **BR-INV-04** (`CHECK ck_inv_item_resale_requires_price_and_income`) — a
 * `RESALE` item must carry both `sale_price` and `gl_income_account_id`
 * before it can ever be sold; every other `item_type` leaves both nullable.
 *
 * **GL trio**: `gl_asset_account_id`/`gl_expense_account_id` are required FKs
 * to `gl_account` (imported via `accounting`'s barrel — a plain entity
 * target, no sibling-domain circular-require concern); `gl_income_account_id`
 * is nullable, required only for `RESALE` items per BR-INV-04 above.
 *
 * **`avg_cost` is deliberately NOT routed through `MoneyTransformer`** — the
 * DDL specifies `NUMERIC(18,6)`, one significant digit finer than `Money`'s
 * hard-coded `SCALE = 4` (`shared/money/money.ts`). Using `Money` here would
 * silently round/truncate every weighted-average recalculation to 4 decimal
 * places, defeating the DDL's own deliberate extra precision (weighted-average
 * costing accumulates rounding error across many receipts, so the schema
 * asks for more headroom than ordinary money amounts need). Left as the raw
 * decimal string the `pg` driver returns by default — same "no float, no
 * premature rounding" reasoning `money.transformer.ts`'s own doc comment
 * gives, just without routing through the 4-decimal `Money` type. `sale_price`
 * IS `NUMERIC(18,4)` (ordinary money, matches `Money`'s scale exactly) so it
 * DOES use `MoneyTransformer`. `reorder_level`/`reorder_qty` are physical
 * quantities, not currency — `NUMERIC(14,4)`, left as raw decimal strings,
 * the same treatment `proc_po_line.qty` established for this codebase's
 * non-Money `NUMERIC` quantity columns (no dedicated `Quantity` value type
 * exists yet; a natural candidate for the next pass to introduce if
 * warranted).
 *
 * `preferred_supplier_ids uuid[]` — a plain Postgres array column, same
 * pattern `wall_wallet.category_blocks`/`proc_supplier.categories`
 * established. A Postgres array cannot carry a real FK constraint, so this
 * stays a loose array regardless of `domains/procurement` being in this
 * module's dependency graph — a structural limitation, not a gap (same
 * treatment `appr_level.user_ids` already gets in this codebase).
 *
 * `ix_inv_item_name_trgm` (GIN `gin_trgm_ops` on `name`, the DDL's own
 * `ix: GIN trgm(name)`) is raw SQL in migration `0110` (no TypeORM decorator
 * support for `gin_trgm_ops`, same as `ix_proc_supplier_name_trgm`).
 * `ix_inv_item_barcode` (the DDL's own named index) is a partial unique
 * index over non-NULL `barcode` values, the same "nullable UNIQUE" shape
 * `wall_transaction.idempotency_key` established.
 */
@Entity("inv_item")
@Index("uq_inv_item_code", ["code"], { unique: true })
@Index("ix_inv_item_barcode", ["barcode"], { unique: true, where: `"barcode" IS NOT NULL` })
@Check("ck_inv_item_type", `"item_type" IN ('STOCK','CONSUMABLE','SERVICE','RESALE')`)
@Check(
  "ck_inv_item_resale_requires_price_and_income",
  `"item_type" <> 'RESALE' OR ("sale_price" IS NOT NULL AND "gl_income_account_id" IS NOT NULL)`,
)
export class InvItemEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "category_id" })
  categoryId!: string;

  @ManyToOne(() => InvCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: InvCategoryEntity;

  @Column({ type: "varchar", length: 20, name: "uom" })
  uom!: string;

  @Column({ type: "jsonb", name: "uom_conversions", nullable: true })
  uomConversions!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 60, name: "barcode", nullable: true })
  barcode!: string | null;

  @Column({ type: "varchar", length: 12, name: "item_type" })
  itemType!: InvItemType;

  /** Physical quantity, not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "reorder_level", nullable: true })
  reorderLevel!: string | null;

  @Column({ type: "numeric", precision: 14, scale: 4, name: "reorder_qty", nullable: true })
  reorderQty!: string | null;

  /** Loose uuid[], no FK possible on a Postgres array — see class doc comment. */
  @Column({ type: "uuid", name: "preferred_supplier_ids", array: true, nullable: true })
  preferredSupplierIds!: string[] | null;

  @Column({ type: "uuid", name: "gl_asset_account_id" })
  glAssetAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_asset_account_id" })
  glAssetAccount?: GlAccountEntity;

  @Column({ type: "uuid", name: "gl_expense_account_id" })
  glExpenseAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_expense_account_id" })
  glExpenseAccount?: GlAccountEntity;

  /** NOT NULL only for RESALE items — see BR-INV-04 CHECK above. */
  @Column({ type: "uuid", name: "gl_income_account_id", nullable: true })
  glIncomeAccountId!: string | null;

  @ManyToOne(() => GlAccountEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_income_account_id" })
  glIncomeAccount?: GlAccountEntity | null;

  /** NOT NULL only for RESALE items — see BR-INV-04 CHECK above. NUMERIC(18,4), matches Money's scale — uses MoneyTransformer. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "sale_price",
    nullable: true,
    transformer: MoneyTransformer,
  })
  salePrice!: Money | null;

  /** NUMERIC(18,6), deliberately NOT Money-transformed — see class doc comment. */
  @Column({ type: "numeric", precision: 18, scale: 6, name: "avg_cost", default: 0 })
  avgCost!: string;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
