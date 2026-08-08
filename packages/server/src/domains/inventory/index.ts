/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 13
 * (Inventory) — application-layer pass now landed on top of the foundation
 * pass (docs/phase-5/PROGRESS.md): every domain entity/repository/service is
 * exported here. `domains/procurement`'s `ProcRequisitionLineEntity`/
 * `ProcQuotationLineEntity`/`ProcPoLineEntity` import `InvItemEntity`
 * directly from its entity file (never through this barrel), per this
 * codebase's circular-require-avoidance discipline for cross-domain entity
 * FK targets — that discipline is unaffected by this pass's new service
 * exports below.
 */
export { InventoryModule } from "./inventory.module";

export { InvCategoryEntity } from "./domain/inv-category.entity";
export { InvStoreEntity } from "./domain/inv-store.entity";
export { InvItemEntity, INV_ITEM_TYPES } from "./domain/inv-item.entity";
export type { InvItemType } from "./domain/inv-item.entity";
export { InvStockBalanceEntity } from "./domain/inv-stock-balance.entity";
export { InvMovementEntity, INV_MOVEMENT_TYPES } from "./domain/inv-movement.entity";
export type { InvMovementType } from "./domain/inv-movement.entity";
export { InvTransferEntity, INV_TRANSFER_STATUSES } from "./domain/inv-transfer.entity";
export type { InvTransferStatus } from "./domain/inv-transfer.entity";
export { InvTransferLineEntity } from "./domain/inv-transfer-line.entity";
export { InvStockTakeEntity, INV_STOCK_TAKE_STATUSES } from "./domain/inv-stock-take.entity";
export type { InvStockTakeStatus } from "./domain/inv-stock-take.entity";
export { InvStockTakeLineEntity } from "./domain/inv-stock-take-line.entity";

export { InvCategoryRepository } from "./infrastructure/inv-category.repository";
export { InvStoreRepository } from "./infrastructure/inv-store.repository";
export type { ListInvStoresFilter } from "./infrastructure/inv-store.repository";
export { InvItemRepository } from "./infrastructure/inv-item.repository";
export type { ListInvItemsFilter } from "./infrastructure/inv-item.repository";
export { InvStockBalanceRepository } from "./infrastructure/inv-stock-balance.repository";
export { InvMovementRepository } from "./infrastructure/inv-movement.repository";
export { InvTransferRepository } from "./infrastructure/inv-transfer.repository";
export type { ListInvTransfersFilter } from "./infrastructure/inv-transfer.repository";
export { InvTransferLineRepository } from "./infrastructure/inv-transfer-line.repository";
export { InvStockTakeRepository } from "./infrastructure/inv-stock-take.repository";
export type { ListInvStockTakesFilter } from "./infrastructure/inv-stock-take.repository";
export { InvStockTakeLineRepository } from "./infrastructure/inv-stock-take-line.repository";

export { CategoriesService } from "./application/categories.service";
export type { CreateCategoryInput, UpdateCategoryInput } from "./application/categories.service";
export { StoresService } from "./application/stores.service";
export type { CreateStoreInput, UpdateStoreInput } from "./application/stores.service";
export { ItemsService } from "./application/items.service";
export type { CreateItemInput, UpdateItemInput } from "./application/items.service";
export { StockMovementsService } from "./application/stock-movements.service";
export type {
  RecordReceiptInput,
  RecordIssueInput,
  RecordReturnInput,
  RecordAdjustmentInput,
  RecordTransferOutInput,
  RecordTransferInInput,
} from "./application/stock-movements.service";
export { TransfersService } from "./application/transfers.service";
export type { IssueTransferInput, TransferLineInput } from "./application/transfers.service";
export { StockTakesService, STOCK_ADJUSTMENTS_APPROVAL_DOMAIN_CODE } from "./application/stock-takes.service";
export type { CreateStockTakeSessionInput, RecordStockTakeCountInput } from "./application/stock-takes.service";
export type { InvStockTakeScope } from "./application/stock-take-scope.util";
export { isItemInScope } from "./application/stock-take-scope.util";
export {
  resolveInventoryControlAccount,
  resolveStockLossExpenseAccount,
  STOCK_LOSS_EXPENSE_ACCOUNT_CODE,
} from "./application/gl-inventory-accounts.util";
