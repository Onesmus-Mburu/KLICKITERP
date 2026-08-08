import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { ApprovalsModule } from "../../platform/approvals";
import { SettingsModule } from "../../platform/settings";
import { InvCategoryEntity } from "./domain/inv-category.entity";
import { InvStoreEntity } from "./domain/inv-store.entity";
import { InvItemEntity } from "./domain/inv-item.entity";
import { InvStockBalanceEntity } from "./domain/inv-stock-balance.entity";
import { InvMovementEntity } from "./domain/inv-movement.entity";
import { InvTransferEntity } from "./domain/inv-transfer.entity";
import { InvTransferLineEntity } from "./domain/inv-transfer-line.entity";
import { InvStockTakeEntity } from "./domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "./domain/inv-stock-take-line.entity";
import { InvCategoryRepository } from "./infrastructure/inv-category.repository";
import { InvStoreRepository } from "./infrastructure/inv-store.repository";
import { InvItemRepository } from "./infrastructure/inv-item.repository";
import { InvStockBalanceRepository } from "./infrastructure/inv-stock-balance.repository";
import { InvMovementRepository } from "./infrastructure/inv-movement.repository";
import { InvTransferRepository } from "./infrastructure/inv-transfer.repository";
import { InvTransferLineRepository } from "./infrastructure/inv-transfer-line.repository";
import { InvStockTakeRepository } from "./infrastructure/inv-stock-take.repository";
import { InvStockTakeLineRepository } from "./infrastructure/inv-stock-take-line.repository";
import { CategoriesService } from "./application/categories.service";
import { StoresService } from "./application/stores.service";
import { ItemsService } from "./application/items.service";
import { StockMovementsService } from "./application/stock-movements.service";
import { TransfersService } from "./application/transfers.service";
import { StockTakesService } from "./application/stock-takes.service";
import { CategoriesController } from "./api/categories.controller";
import { StoresController } from "./api/stores.controller";
import { ItemsController } from "./api/items.controller";
import { StockMovementsController } from "./api/stock-movements.controller";
import { TransfersController } from "./api/transfers.controller";
import { StockTakesController } from "./api/stock-takes.controller";

/**
 * Module 13 (Inventory) — application-layer pass now landed on top of the
 * foundation pass (docs/phase-5/PROGRESS.md). `AccountingModule`
 * (`PostingService`/`GlAccountRepository` — `StockTakesService.post()`'s
 * P-24 posting), `SettingsModule` (`NumberingService.allocate()` —
 * `INV_TRANSFER`/`INV_STOCK_TAKE` numbering), `ApprovalsModule`
 * (`ApprovalEngineService.submit()` — `STOCK_ADJUSTMENTS`,
 * `StockTakesService.submitForApproval()`) now imported as real Nest
 * modules, mirroring every other domain module's foundation-pass ->
 * application-pass transition (see `procurement.module.ts`'s own precedent
 * doc comment). `domains/billing`'s `resolveControlAccount()`
 * (`gl-inventory-accounts.util.ts`) is a PLAIN function import via that
 * module's barrel — not a Nest module dependency, so `BillingModule` is
 * deliberately NOT imported here (nothing needs it as a DI provider).
 *
 * **Controllers registered below — verified explicitly** (a real bug in
 * this codebase once came from a `@Module({...})` decorator that imported
 * every controller but never listed them in `controllers:` — see Module 9's
 * own PROGRESS.md row for the exact incident this task brief itself warned
 * against repeating): all 6 controllers (`categories`, `stores`, `items`,
 * `stock-movements`, `transfers`, `stock-takes`) ARE present in the
 * `controllers` array below.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvCategoryEntity,
      InvStoreEntity,
      InvItemEntity,
      InvStockBalanceEntity,
      InvMovementEntity,
      InvTransferEntity,
      InvTransferLineEntity,
      InvStockTakeEntity,
      InvStockTakeLineEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
  ],
  controllers: [
    CategoriesController,
    StoresController,
    ItemsController,
    StockMovementsController,
    TransfersController,
    StockTakesController,
  ],
  providers: [
    InvCategoryRepository,
    InvStoreRepository,
    InvItemRepository,
    InvStockBalanceRepository,
    InvMovementRepository,
    InvTransferRepository,
    InvTransferLineRepository,
    InvStockTakeRepository,
    InvStockTakeLineRepository,
    CategoriesService,
    StoresService,
    ItemsService,
    StockMovementsService,
    TransfersService,
    StockTakesService,
  ],
  exports: [
    InvCategoryRepository,
    InvStoreRepository,
    InvItemRepository,
    InvStockBalanceRepository,
    InvMovementRepository,
    InvTransferRepository,
    InvTransferLineRepository,
    InvStockTakeRepository,
    InvStockTakeLineRepository,
    CategoriesService,
    StoresService,
    ItemsService,
    StockMovementsService,
    TransfersService,
    StockTakesService,
  ],
})
export class InventoryModule {}
