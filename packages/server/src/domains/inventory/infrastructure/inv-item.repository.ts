import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { InvItemEntity, InvItemType } from "../domain/inv-item.entity";

export interface ListInvItemsFilter {
  categoryId?: string;
  itemType?: InvItemType;
  isActive?: boolean;
}

/** Raw-row shape returned by `searchByName()`'s hand-written SQL — snake_case, matching `app.inv_item`'s columns 1:1. */
interface RawInvItemSearchRow {
  id: string;
  code: string;
  name: string;
  category_id: string;
  uom: string;
  uom_conversions: Record<string, unknown> | null;
  barcode: string | null;
  item_type: InvItemType;
  reorder_level: string | null;
  reorder_qty: string | null;
  preferred_supplier_ids: string[] | null;
  gl_asset_account_id: string;
  gl_expense_account_id: string;
  gl_income_account_id: string | null;
  sale_price: string | null;
  avg_cost: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  relevance: number;
}

function mapRawSearchRow(row: RawInvItemSearchRow): InvItemEntity {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.category_id,
    uom: row.uom,
    uomConversions: row.uom_conversions,
    barcode: row.barcode,
    itemType: row.item_type,
    reorderLevel: row.reorder_level,
    reorderQty: row.reorder_qty,
    preferredSupplierIds: row.preferred_supplier_ids,
    glAssetAccountId: row.gl_asset_account_id,
    glExpenseAccountId: row.gl_expense_account_id,
    glIncomeAccountId: row.gl_income_account_id,
    salePrice: row.sale_price === null ? null : Money.fromDecimalString(row.sale_price),
    avgCost: row.avg_cost,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
  } as InvItemEntity;
}

/**
 * Plain repository wrapper for `inv_item`, plus `searchByName()` (trgm
 * similarity, mirroring `ProcSupplierRepository.searchByName()`'s exact
 * `pg_trgm` `%` pattern against `ix_inv_item_name_trgm`, migration `0110`)
 * and `findByBarcode()` (POS/GRN scanner lookup).
 */
@Injectable()
export class InvItemRepository {
  constructor(
    @InjectRepository(InvItemEntity)
    private readonly repo: Repository<InvItemEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvItemEntity | null> {
    return (manager?.getRepository(InvItemEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvItemEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvItem", id);
    return row;
  }

  async findByCode(code: string, manager?: EntityManager): Promise<InvItemEntity | null> {
    return (manager?.getRepository(InvItemEntity) ?? this.repo).findOne({ where: { code } });
  }

  /** Barcode scanner lookup (POS/GRN) — `ix_inv_item_barcode` (partial unique, non-NULL barcodes only). */
  async findByBarcode(barcode: string, manager?: EntityManager): Promise<InvItemEntity | null> {
    return (manager?.getRepository(InvItemEntity) ?? this.repo).findOne({ where: { barcode } });
  }

  async list(filter: ListInvItemsFilter = {}, manager?: EntityManager): Promise<InvItemEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.itemType !== undefined) where.itemType = filter.itemType;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return (manager?.getRepository(InvItemEntity) ?? this.repo).find({ where, order: { name: "ASC" } });
  }

  async create(data: Partial<InvItemEntity>, manager?: EntityManager): Promise<InvItemEntity> {
    const repo = manager?.getRepository(InvItemEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvItemEntity, manager?: EntityManager): Promise<InvItemEntity> {
    return (manager?.getRepository(InvItemEntity) ?? this.repo).save(entity);
  }

  /**
   * Trigram similarity search against `name` (`ix_inv_item_name_trgm`).
   * Returns at most `limit` rows, most-relevant first.
   */
  async searchByName(query: string, limit = 20, manager?: EntityManager): Promise<InvItemEntity[]> {
    const source = manager ?? this.repo.manager;
    const normalized = query.trim().toLowerCase();
    const rows: RawInvItemSearchRow[] = await source.query(
      `
      SELECT i.*, similarity(i.name, $1) AS relevance
      FROM app.inv_item i
      WHERE i.name % $1
      ORDER BY relevance DESC, i.name ASC
      LIMIT $2
      `,
      [normalized, limit],
    );
    return rows.map(mapRawSearchRow);
  }
}
