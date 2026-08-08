import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaAssetEntity, FaAssetStatus } from "../domain/fa-asset.entity";

export interface ListFaAssetsFilter {
  categoryId?: string;
  status?: FaAssetStatus;
  custodianUserId?: string;
}

/**
 * Plain repository wrapper for `fa_asset`, plus two forward-looking finders
 * the next pass's application layer needs:
 *
 * - `findActiveForDepreciation()` — assets with `status='ACTIVE'` and NBV
 *   (`cost - accum_depreciation`) still above `residual_value`, i.e. not yet
 *   fully depreciated (BR-FA-01) — exactly the population query the next
 *   pass's monthly depreciation-run engine needs to build a run's lines.
 * - `searchByCodeOrBarcode()` — the asset-register/verification-session
 *   scanner lookup. Unlike `InvItemRepository.searchByName()`/
 *   `ProcSupplierRepository.searchByName()`'s `pg_trgm` similarity search,
 *   this uses a plain `ILIKE` prefix/substring match — the DDL names no
 *   `GIN trgm` index for `fa_asset` (unlike `inv_item.name`/
 *   `proc_supplier.name`), so no trigram index exists to search against;
 *   `code`/`barcode` lookups are typically exact or near-exact scans anyway,
 *   not fuzzy free-text search, so `ILIKE` is the proportionate choice here.
 */
@Injectable()
export class FaAssetRepository {
  constructor(
    @InjectRepository(FaAssetEntity)
    private readonly repo: Repository<FaAssetEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaAssetEntity | null> {
    return (manager?.getRepository(FaAssetEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaAssetEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaAsset", id);
    return row;
  }

  async findByCode(code: string, manager?: EntityManager): Promise<FaAssetEntity | null> {
    return (manager?.getRepository(FaAssetEntity) ?? this.repo).findOne({ where: { code } });
  }

  async findByBarcode(barcode: string, manager?: EntityManager): Promise<FaAssetEntity | null> {
    return (manager?.getRepository(FaAssetEntity) ?? this.repo).findOne({ where: { barcode } });
  }

  async list(filter: ListFaAssetsFilter = {}, manager?: EntityManager): Promise<FaAssetEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.custodianUserId !== undefined) where.custodianUserId = filter.custodianUserId;
    return (manager?.getRepository(FaAssetEntity) ?? this.repo).find({ where, order: { code: "ASC" } });
  }

  async create(data: Partial<FaAssetEntity>, manager?: EntityManager): Promise<FaAssetEntity> {
    const repo = manager?.getRepository(FaAssetEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaAssetEntity, manager?: EntityManager): Promise<FaAssetEntity> {
    return (manager?.getRepository(FaAssetEntity) ?? this.repo).save(entity);
  }

  /**
   * ACTIVE assets not yet fully depreciated (BR-FA-01) — the next pass's
   * depreciation-run population query.
   */
  async findActiveForDepreciation(manager?: EntityManager): Promise<FaAssetEntity[]> {
    return (manager?.getRepository(FaAssetEntity) ?? this.repo)
      .createQueryBuilder("a")
      .where("a.status = :status", { status: "ACTIVE" })
      .andWhere("a.accumDepreciation < a.cost - a.residualValue")
      .orderBy("a.code", "ASC")
      .getMany();
  }

  /**
   * `ILIKE` substring match against `code` OR `barcode` — see class doc
   * comment for why this isn't a trigram search.
   */
  async searchByCodeOrBarcode(query: string, limit = 20, manager?: EntityManager): Promise<FaAssetEntity[]> {
    const normalized = `%${query.trim()}%`;
    return (manager?.getRepository(FaAssetEntity) ?? this.repo)
      .createQueryBuilder("a")
      .where("a.code ILIKE :q", { q: normalized })
      .orWhere("a.barcode ILIKE :q", { q: normalized })
      .orderBy("a.code", "ASC")
      .limit(limit)
      .getMany();
  }
}
