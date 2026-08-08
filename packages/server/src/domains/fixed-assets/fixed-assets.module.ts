import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { ApprovalsModule } from "../../platform/approvals";
import { SettingsModule } from "../../platform/settings";
import { FaCategoryEntity } from "./domain/fa-category.entity";
import { FaAssetEntity } from "./domain/fa-asset.entity";
import { FaDepreciationRunEntity } from "./domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "./domain/fa-depreciation-line.entity";
import { FaMaintenanceEntity } from "./domain/fa-maintenance.entity";
import { FaTransferEntity } from "./domain/fa-transfer.entity";
import { FaDisposalEntity } from "./domain/fa-disposal.entity";
import { FaVerificationEntity } from "./domain/fa-verification.entity";
import { FaVerificationLineEntity } from "./domain/fa-verification-line.entity";
import { FaCategoryRepository } from "./infrastructure/fa-category.repository";
import { FaAssetRepository } from "./infrastructure/fa-asset.repository";
import { FaDepreciationRunRepository } from "./infrastructure/fa-depreciation-run.repository";
import { FaDepreciationLineRepository } from "./infrastructure/fa-depreciation-line.repository";
import { FaMaintenanceRepository } from "./infrastructure/fa-maintenance.repository";
import { FaTransferRepository } from "./infrastructure/fa-transfer.repository";
import { FaDisposalRepository } from "./infrastructure/fa-disposal.repository";
import { FaVerificationRepository } from "./infrastructure/fa-verification.repository";
import { FaVerificationLineRepository } from "./infrastructure/fa-verification-line.repository";
import { CategoriesService } from "./application/categories.service";
import { AssetsService } from "./application/assets.service";
import { DepreciationRunsService } from "./application/depreciation-runs.service";
import { TransfersService } from "./application/transfers.service";
import { MaintenanceService } from "./application/maintenance.service";
import { DisposalService } from "./application/disposal.service";
import { VerificationService } from "./application/verification.service";
import { CategoriesController } from "./api/categories.controller";
import { AssetsController } from "./api/assets.controller";
import { DepreciationRunsController } from "./api/depreciation-runs.controller";
import { TransfersController } from "./api/transfers.controller";
import { MaintenanceController } from "./api/maintenance.controller";
import { DisposalController } from "./api/disposal.controller";
import { VerificationController } from "./api/verification.controller";

/**
 * Module 17 (Fixed Assets) — application-layer pass now landed on top of the
 * foundation pass (docs/phase-5/PROGRESS.md): asset register CRUD, the
 * monthly depreciation-run engine (SL/RB, prorated, BR-FA-01 capped, P-30
 * per-category aggregated), the disposal wizard (gain/loss, ASSET_DISPOSALS
 * approval, P-31), transfers, maintenance, physical verification sessions
 * mirroring `inventory/stock-takes`, all 7 controllers, DTOs, permission
 * codes, and the `0900` seed extension. `AccountingModule`
 * (`PostingService`/`GlAccountRepository`/`GlPeriodRepository` —
 * `DepreciationRunsService.post()`'s P-30, `DisposalService.post()`'s P-31),
 * `SettingsModule` (`NumberingService.allocate()` — `FA_VERIFICATION`
 * numbering), `ApprovalsModule` (`ApprovalEngineService.submit()` —
 * `DEPRECIATION`/`ASSET_DISPOSALS`/`ASSET_VERIFICATION`) now imported as real
 * Nest modules, mirroring every other domain module's own foundation-pass ->
 * application-pass transition. `domains/procurement`/`domains/expenses` are
 * NOT imported as Nest modules here — their FKs on `fa_asset`/
 * `fa_maintenance` are compile-time-only `@ManyToOne` entity targets, no
 * sibling *service* is ever called at runtime (same foundation-pass judgement
 * call carried forward unchanged).
 *
 * **Controllers registered below — verified explicitly** (a real bug in this
 * codebase once came from a `@Module({...})` decorator that imported every
 * controller but never listed them in `controllers:` — see Module 9's own
 * PROGRESS.md row for the exact incident this task brief itself warns
 * against repeating): all 7 controllers (`categories`, `assets`,
 * `depreciation-runs`, `transfers`, `maintenance`, `disposal`,
 * `verification`) ARE present in the `controllers` array below.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FaCategoryEntity,
      FaAssetEntity,
      FaDepreciationRunEntity,
      FaDepreciationLineEntity,
      FaMaintenanceEntity,
      FaTransferEntity,
      FaDisposalEntity,
      FaVerificationEntity,
      FaVerificationLineEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
  ],
  controllers: [
    CategoriesController,
    AssetsController,
    DepreciationRunsController,
    TransfersController,
    MaintenanceController,
    DisposalController,
    VerificationController,
  ],
  providers: [
    FaCategoryRepository,
    FaAssetRepository,
    FaDepreciationRunRepository,
    FaDepreciationLineRepository,
    FaMaintenanceRepository,
    FaTransferRepository,
    FaDisposalRepository,
    FaVerificationRepository,
    FaVerificationLineRepository,
    CategoriesService,
    AssetsService,
    DepreciationRunsService,
    TransfersService,
    MaintenanceService,
    DisposalService,
    VerificationService,
  ],
  exports: [
    FaCategoryRepository,
    FaAssetRepository,
    FaDepreciationRunRepository,
    FaDepreciationLineRepository,
    FaMaintenanceRepository,
    FaTransferRepository,
    FaDisposalRepository,
    FaVerificationRepository,
    FaVerificationLineRepository,
    CategoriesService,
    AssetsService,
    DepreciationRunsService,
    TransfersService,
    MaintenanceService,
    DisposalService,
    VerificationService,
  ],
})
export class FixedAssetsModule {}
