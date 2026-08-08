import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { InvItemEntity } from "./inv-item.entity";
import { InvStoreEntity } from "./inv-store.entity";

/**
 * Maps to `inv_stock_balance` (docs/phase-4/04-schema-operations.md §3) — an
 * N-3 cache: on-hand qty/value per (item, store), maintained by the next
 * pass's stock-movement engine under a pessimistic row lock, the same shape
 * `wall_wallet.balance` established for Module 11 (Wallet). Module 13
 * (Inventory) **foundation pass only**.
 *
 * `MutableBaseEntity` — `qty`/`value` are incremented/decremented in place
 * on every movement (`InvStockBalanceRepository.findByIdForUpdate()` is the
 * load-bearing pessimistic-lock method the next pass's engine uses,
 * mirroring `WallWalletRepository.findByIdForUpdate()`'s exact discipline).
 *
 * **BR-INV-01** (`CHECK ck_inv_stock_balance_qty_nonneg`, `qty >= 0`) — stock
 * on hand may never go negative in any store; issues/sales beyond
 * availability are rejected. This DB-layer floor is the defense-in-depth
 * backstop behind the next pass's service-layer availability check, the
 * same "DB constraint + service check" pairing `ck_wall_wallet_balance_floor`
 * established for BR-WALL-01.
 *
 * `qty` is a physical quantity, not currency — `NUMERIC(14,4)`, left as a
 * raw decimal string (see `InvItemEntity`'s doc comment for the codebase-wide
 * reasoning). `value` IS ordinary money (`NUMERIC(18,4)`, matches `Money`'s
 * scale) — uses `RequiredMoneyTransformer`.
 *
 * **No writer-guard trigger** (`trg_gl_writer_guard`-style `application_name`
 * gate) is added to this table — see `InvMovementEntity`'s doc comment for
 * the full judgement-call reasoning, identical to Wallet's own (migration
 * `0090`'s doc comment): exactly one service in this codebase will ever
 * write `inv_stock_balance`, so a fan-in choke point designed for GL's
 * many-writers problem would be over-engineering here.
 */
@Entity("inv_stock_balance")
@Index("uq_inv_stock_balance_item_store", ["itemId", "storeId"], { unique: true })
@Check("ck_inv_stock_balance_qty_nonneg", `"qty" >= 0`)
export class InvStockBalanceEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "item_id" })
  itemId!: string;

  @ManyToOne(() => InvItemEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity;

  @Column({ type: "uuid", name: "store_id" })
  storeId!: string;

  @ManyToOne(() => InvStoreEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "store_id" })
  store?: InvStoreEntity;

  /** Physical quantity, not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "qty", default: 0 })
  qty!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "value",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  value!: Money;
}
