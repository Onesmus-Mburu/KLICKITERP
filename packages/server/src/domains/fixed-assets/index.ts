/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 17 (Fixed
 * Assets) is now ✅ COMPLETE: entities/repositories (foundation pass) +
 * application services/controllers/DTOs/permission codes/seed
 * (application-layer pass) — see docs/phase-5/PROGRESS.md.
 */
export { FixedAssetsModule } from "./fixed-assets.module";

export { CategoriesService } from "./application/categories.service";
export type { CreateFaCategoryInput, UpdateFaCategoryInput } from "./application/categories.service";
export { AssetsService } from "./application/assets.service";
export type { CreateFaAssetInput, UpdateFaAssetInput } from "./application/assets.service";
export { DepreciationRunsService, DEPRECIATION_APPROVAL_DOMAIN_CODE } from "./application/depreciation-runs.service";
export { TransfersService } from "./application/transfers.service";
export type { CreateFaTransferInput } from "./application/transfers.service";
export { MaintenanceService } from "./application/maintenance.service";
export type { ScheduleMaintenanceInput, CompleteMaintenanceInput } from "./application/maintenance.service";
export { DisposalService, ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE } from "./application/disposal.service";
export type { CreateFaDisposalInput } from "./application/disposal.service";
export {
  VerificationService,
  ASSET_VERIFICATION_APPROVAL_DOMAIN_CODE,
} from "./application/verification.service";
export type {
  FaVerificationScope,
  RecordVerificationCountInput,
  PostVerificationResult,
} from "./application/verification.service";

export { FaCategoryEntity, FA_CATEGORY_METHODS } from "./domain/fa-category.entity";
export type { FaCategoryMethod } from "./domain/fa-category.entity";
export {
  FaAssetEntity,
  FA_ASSET_FUNDING_SOURCES,
  FA_ASSET_STATUSES,
  FA_ASSET_DISPOSED_STATUSES,
} from "./domain/fa-asset.entity";
export type { FaAssetFundingSource, FaAssetStatus } from "./domain/fa-asset.entity";
export { FaDepreciationRunEntity, FA_DEPRECIATION_RUN_STATUSES } from "./domain/fa-depreciation-run.entity";
export type { FaDepreciationRunStatus } from "./domain/fa-depreciation-run.entity";
export { FaDepreciationLineEntity } from "./domain/fa-depreciation-line.entity";
export { FaMaintenanceEntity, FA_MAINTENANCE_KINDS } from "./domain/fa-maintenance.entity";
export type { FaMaintenanceKind } from "./domain/fa-maintenance.entity";
export { FaTransferEntity } from "./domain/fa-transfer.entity";
export { FaDisposalEntity, FA_DISPOSAL_METHODS, FA_DISPOSAL_STATUSES } from "./domain/fa-disposal.entity";
export type { FaDisposalMethod, FaDisposalStatus } from "./domain/fa-disposal.entity";
export { FaVerificationEntity, FA_VERIFICATION_STATUSES } from "./domain/fa-verification.entity";
export type { FaVerificationStatus } from "./domain/fa-verification.entity";
export { FaVerificationLineEntity } from "./domain/fa-verification-line.entity";

export { FaCategoryRepository } from "./infrastructure/fa-category.repository";
export { FaAssetRepository } from "./infrastructure/fa-asset.repository";
export type { ListFaAssetsFilter } from "./infrastructure/fa-asset.repository";
export { FaDepreciationRunRepository } from "./infrastructure/fa-depreciation-run.repository";
export type { ListFaDepreciationRunsFilter } from "./infrastructure/fa-depreciation-run.repository";
export { FaDepreciationLineRepository } from "./infrastructure/fa-depreciation-line.repository";
export { FaMaintenanceRepository } from "./infrastructure/fa-maintenance.repository";
export { FaTransferRepository } from "./infrastructure/fa-transfer.repository";
export { FaDisposalRepository } from "./infrastructure/fa-disposal.repository";
export type { ListFaDisposalsFilter } from "./infrastructure/fa-disposal.repository";
export { FaVerificationRepository } from "./infrastructure/fa-verification.repository";
export type { ListFaVerificationsFilter } from "./infrastructure/fa-verification.repository";
export { FaVerificationLineRepository } from "./infrastructure/fa-verification-line.repository";
