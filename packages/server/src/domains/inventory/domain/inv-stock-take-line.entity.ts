import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { InvItemEntity } from "./inv-item.entity";
import { InvStockTakeEntity } from "./inv-stock-take.entity";

/**
 * Maps to `inv_stock_take_line` (docs/phase-4/04-schema-operations.md §3,
 * the DDL's inline "+ inv_stock_take_line (item_id, snapshot_qty,
 * counted_qty NULL, variance_qty GENERATED, variance_value NUMERIC(18,4))"
 * shorthand) — one counted item within an `inv_stock_take`. Module 13
 * (Inventory) **foundation pass only**.
 *
 * `stock_take_id` (FK to `inv_stock_take`, `ON DELETE CASCADE`) is not named
 * explicitly in the DDL's inline shorthand but is obviously required for a
 * child line table — the same "obvious parent FK the shorthand doesn't spell
 * out" judgement call `proc_grn_line`/`proc_voucher_allocation` made for
 * their own parent FKs.
 *
 * **Base-class judgement call**: `MutableBaseEntity` — `snapshot_qty` is
 * frozen at session-creation time, but `counted_qty` is a genuine
 * post-creation update: it starts NULL and is filled in DURING the counting
 * phase (scanner/manual/CSV entry, FR-INV-009.1), the defining
 * "real post-creation edit window" shape this codebase's line-table
 * judgement calls look for (the same reasoning `proc_po_line.received_qty`
 * used, not `inv_transfer_line`'s "captured atomically, no edit window"
 * divergence).
 *
 * **`variance_qty` is a real Postgres `GENERATED ALWAYS AS (counted_qty -
 * snapshot_qty) STORED` column** — same technique `StdStudentEntity
 * .searchName` established (migration `0065`): TypeORM's `generatedType:
 * "STORED"`/`asExpression` metadata is read-only entity/query-builder
 * hydration information, NOT a DDL source in this codebase's hand-written-
 * migration workflow (no `synchronize` step exists anywhere in the
 * build/deploy path) — migration `0110` spells out the identical expression
 * in raw SQL. When `counted_qty` is still NULL (pre-count), Postgres
 * arithmetic with NULL yields NULL, so `variance_qty` is simply NULL until
 * counting fills in `counted_qty` — no special-casing needed.
 *
 * `snapshot_qty`/`counted_qty`/`variance_qty` are physical quantities, not
 * currency — `NUMERIC(14,4)`, raw decimal strings, the same treatment
 * `InvItemEntity`'s doc comment establishes codebase-wide. `variance_value`
 * IS ordinary money (`NUMERIC(18,4)`, matches `Money`'s scale) — nullable
 * (computed by the next pass's variance-report step, not at line-creation
 * time) and uses `MoneyTransformer`.
 */
@Entity("inv_stock_take_line")
export class InvStockTakeLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "stock_take_id" })
  stockTakeId!: string;

  @ManyToOne(() => InvStockTakeEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "stock_take_id" })
  stockTake?: InvStockTakeEntity;

  @Column({ type: "uuid", name: "item_id" })
  itemId!: string;

  @ManyToOne(() => InvItemEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity;

  /** Physical quantity, not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "snapshot_qty" })
  snapshotQty!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, name: "counted_qty", nullable: true })
  countedQty!: string | null;

  /**
   * STORED generated column — computed by Postgres, never set by
   * application code. See class doc comment.
   */
  @Column({
    type: "numeric",
    precision: 14,
    scale: 4,
    name: "variance_qty",
    insert: false,
    update: false,
    generatedType: "STORED",
    asExpression: `counted_qty - snapshot_qty`,
    nullable: true,
  })
  varianceQty!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "variance_value",
    nullable: true,
    transformer: MoneyTransformer,
  })
  varianceValue!: Money | null;
}
