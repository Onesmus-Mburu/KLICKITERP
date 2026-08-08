/**
 * **BR-INV-03 scope-shape design decision** (`inv_stock_take.scope jsonb` —
 * the DDL leaves this column's shape entirely open, see
 * `InvStockTakeEntity`'s own doc comment). This pass's own judgement call:
 * `{ itemIds: string[] | "ALL" }` — deliberately NOT `{ storeId, itemIds }`
 * as a first sketch might suggest, because `inv_stock_take` already carries
 * a real `store_id` COLUMN (a genuine FK to `inv_store`, not opaque jsonb) —
 * duplicating the store scope inside `scope` itself would let the two
 * disagree with no constraint stopping it. `scope` therefore narrows ONLY
 * the item axis within that already-fixed store: `"ALL"` freezes every item
 * physically at the stock-take's store for the duration of the count,
 * `string[]` freezes just the named items (a partial/cycle-count session).
 * `StockMovementsService.isNotFrozen()`'s BR-INV-03 check queries
 * `InvStockTakeRepository.listOpenForStore(storeId)` first (store-scoped by
 * the entity's own column) and only THEN consults `scope.itemIds` to decide
 * whether the specific item passed to `recordReceipt()`/`recordIssue()`/etc.
 * falls inside this narrower item-level freeze.
 */
export interface InvStockTakeScope {
  itemIds: string[] | "ALL";
}

/** Whether `itemId` falls inside a stock-take's `scope` — see this file's doc comment for the shape decision. */
export function isItemInScope(scope: Record<string, unknown> | InvStockTakeScope, itemId: string): boolean {
  const typed = scope as InvStockTakeScope;
  if (typed.itemIds === "ALL") return true;
  return Array.isArray(typed.itemIds) && typed.itemIds.includes(itemId);
}
