import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { FaAssetEntity, FaAssetFundingSource } from "../domain/fa-asset.entity";
import { FaAssetRepository, ListFaAssetsFilter } from "../infrastructure/fa-asset.repository";
import { FaCategoryRepository } from "../infrastructure/fa-category.repository";

const DEFAULT_CONDITION = "GOOD";

export interface CreateFaAssetInput {
  code: string;
  name: string;
  categoryId: string;
  serialNo?: string | null;
  barcode?: string | null;
  location: string;
  custodianUserId?: string | null;
  acquisitionDate: string;
  cost: Money;
  fundingSource: FaAssetFundingSource;
  supplierId?: string | null;
  poId?: string | null;
  grnId?: string | null;
  inServiceFrom: string;
  lifeMonthsOverride?: number | null;
  /** Derived from `category.residual_pct × cost` when omitted — see `create()`'s doc comment. */
  residualValue?: Money | null;
  insurance?: Record<string, unknown> | null;
  condition?: string;
  photos?: string[] | null;
}

export interface UpdateFaAssetInput {
  name?: string;
  categoryId?: string;
  serialNo?: string | null;
  barcode?: string | null;
  location?: string;
  custodianUserId?: string | null;
  lifeMonthsOverride?: number | null;
  residualValue?: Money;
  insurance?: Record<string, unknown> | null;
  condition?: string;
  photos?: string[] | null;
}

/** CRUD for `fa_asset`, the asset register (FR-FA-001.1). */
@Injectable()
export class AssetsService {
  constructor(
    private readonly assetRepository: FaAssetRepository,
    private readonly categoryRepository: FaCategoryRepository,
  ) {}

  /**
   * If `residual_value` isn't explicitly given, it's derived from the
   * category's `residual_pct × cost` — a sensible default so callers aren't
   * forced to compute it by hand for the common case of "this category's
   * standard residual policy applies as-is". An asset with genuinely
   * different residual economics can still pass `residualValue` explicitly
   * to override it.
   */
  async create(input: CreateFaAssetInput, actorId: string | null): Promise<FaAssetEntity> {
    const category = await this.categoryRepository.findByIdOrFail(input.categoryId);
    if (!input.cost.isPositive()) {
      throw new ValidationException("fa_asset.cost must be > 0");
    }
    const residualValue = input.residualValue ?? input.cost.multiply(category.residualPct);
    if (residualValue.compare(input.cost) > 0) {
      throw new ValidationException("fa_asset.residual_value cannot exceed cost");
    }
    if (residualValue.isNegative()) {
      throw new ValidationException("fa_asset.residual_value cannot be negative");
    }

    return this.assetRepository.create({
      code: input.code,
      name: input.name,
      categoryId: input.categoryId,
      serialNo: input.serialNo ?? null,
      barcode: input.barcode ?? null,
      location: input.location,
      custodianUserId: input.custodianUserId ?? null,
      acquisitionDate: input.acquisitionDate,
      cost: input.cost,
      fundingSource: input.fundingSource,
      supplierId: input.supplierId ?? null,
      poId: input.poId ?? null,
      grnId: input.grnId ?? null,
      inServiceFrom: input.inServiceFrom,
      lifeMonthsOverride: input.lifeMonthsOverride ?? null,
      residualValue,
      accumDepreciation: Money.ZERO,
      status: "ACTIVE",
      insurance: input.insurance ?? null,
      condition: input.condition ?? DEFAULT_CONDITION,
      photos: input.photos ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(id: string, changes: UpdateFaAssetInput, actorId: string | null): Promise<FaAssetEntity> {
    const asset = await this.assetRepository.findByIdOrFail(id);

    if (changes.categoryId !== undefined) {
      await this.categoryRepository.findByIdOrFail(changes.categoryId);
      asset.categoryId = changes.categoryId;
    }
    if (changes.name !== undefined) asset.name = changes.name;
    if (changes.serialNo !== undefined) asset.serialNo = changes.serialNo;
    if (changes.barcode !== undefined) asset.barcode = changes.barcode;
    if (changes.location !== undefined) asset.location = changes.location;
    if (changes.custodianUserId !== undefined) asset.custodianUserId = changes.custodianUserId;
    if (changes.lifeMonthsOverride !== undefined) asset.lifeMonthsOverride = changes.lifeMonthsOverride;
    if (changes.residualValue !== undefined) {
      if (changes.residualValue.compare(asset.cost) > 0) {
        throw new ValidationException("fa_asset.residual_value cannot exceed cost");
      }
      if (changes.residualValue.isNegative()) {
        throw new ValidationException("fa_asset.residual_value cannot be negative");
      }
      asset.residualValue = changes.residualValue;
    }
    if (changes.insurance !== undefined) asset.insurance = changes.insurance;
    if (changes.condition !== undefined) asset.condition = changes.condition;
    if (changes.photos !== undefined) asset.photos = changes.photos;

    asset.updatedBy = actorId;
    return this.assetRepository.save(asset);
  }

  async findByIdOrFail(id: string): Promise<FaAssetEntity> {
    return this.assetRepository.findByIdOrFail(id);
  }

  async findByCode(code: string): Promise<FaAssetEntity | null> {
    return this.assetRepository.findByCode(code);
  }

  async findByBarcode(barcode: string): Promise<FaAssetEntity | null> {
    return this.assetRepository.findByBarcode(barcode);
  }

  async search(query: string, limit = 20): Promise<FaAssetEntity[]> {
    return this.assetRepository.searchByCodeOrBarcode(query, limit);
  }

  async list(filter: ListFaAssetsFilter = {}): Promise<FaAssetEntity[]> {
    return this.assetRepository.list(filter);
  }

  /**
   * Updates only `condition` — the verification-session/manual-inspection
   * entry point. Accepts an optional caller-supplied `EntityManager` so
   * `VerificationService.post()` can compose this write inside its own
   * transaction (same optional-trailing-manager convention every repository
   * method in this codebase already follows); omitted for a standalone
   * controller call.
   */
  async updateCondition(
    assetId: string,
    condition: string,
    actorId: string | null,
    em?: EntityManager,
  ): Promise<FaAssetEntity> {
    const asset = await this.assetRepository.findByIdOrFail(assetId, em);
    asset.condition = condition;
    asset.updatedBy = actorId;
    return this.assetRepository.save(asset, em);
  }
}
