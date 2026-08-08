import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { InvItemEntity, InvItemType } from "../domain/inv-item.entity";
import { InvItemRepository, ListInvItemsFilter } from "../infrastructure/inv-item.repository";
import { InvCategoryRepository } from "../infrastructure/inv-category.repository";

export interface CreateItemInput {
  code: string;
  name: string;
  categoryId: string;
  uom: string;
  uomConversions?: Record<string, unknown> | null;
  barcode?: string | null;
  itemType: InvItemType;
  reorderLevel?: string | null;
  reorderQty?: string | null;
  preferredSupplierIds?: string[] | null;
  glAssetAccountId: string;
  glExpenseAccountId: string;
  glIncomeAccountId?: string | null;
  salePrice?: Money | null;
}

export interface UpdateItemInput {
  name?: string;
  categoryId?: string;
  uom?: string;
  uomConversions?: Record<string, unknown> | null;
  barcode?: string | null;
  itemType?: InvItemType;
  reorderLevel?: string | null;
  reorderQty?: string | null;
  preferredSupplierIds?: string[] | null;
  glAssetAccountId?: string;
  glExpenseAccountId?: string;
  glIncomeAccountId?: string | null;
  salePrice?: Money | null;
  isActive?: boolean;
}

/**
 * CRUD for `inv_item` — the item master. Enforces **BR-INV-04** at the
 * service layer as defense-in-depth mirroring the DB's own
 * `ck_inv_item_resale_requires_price_and_income` CHECK (see `InvItemEntity`'s
 * doc comment): a `RESALE` item must carry both `sale_price` and
 * `gl_income_account_id` before it can exist in that state — checked on
 * `create()` and again on `update()` (an item can flip INTO `RESALE` from
 * another type, or have its price/income account cleared while already
 * `RESALE`, either of which must be caught here before the DB CHECK ever
 * sees it).
 */
@Injectable()
export class ItemsService {
  constructor(
    private readonly itemRepository: InvItemRepository,
    private readonly categoryRepository: InvCategoryRepository,
  ) {}

  async create(input: CreateItemInput, actorId: string | null): Promise<InvItemEntity> {
    await this.categoryRepository.findByIdOrFail(input.categoryId);
    this.assertResaleRequirements(input.itemType, input.salePrice ?? null, input.glIncomeAccountId ?? null);

    return this.itemRepository.create({
      code: input.code,
      name: input.name,
      categoryId: input.categoryId,
      uom: input.uom,
      uomConversions: input.uomConversions ?? null,
      barcode: input.barcode ?? null,
      itemType: input.itemType,
      reorderLevel: input.reorderLevel ?? null,
      reorderQty: input.reorderQty ?? null,
      preferredSupplierIds: input.preferredSupplierIds ?? null,
      glAssetAccountId: input.glAssetAccountId,
      glExpenseAccountId: input.glExpenseAccountId,
      glIncomeAccountId: input.glIncomeAccountId ?? null,
      salePrice: input.salePrice ?? null,
      avgCost: "0",
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async update(id: string, changes: UpdateItemInput, actorId: string | null): Promise<InvItemEntity> {
    const item = await this.itemRepository.findByIdOrFail(id);
    if (changes.categoryId !== undefined) {
      await this.categoryRepository.findByIdOrFail(changes.categoryId);
      item.categoryId = changes.categoryId;
    }
    if (changes.name !== undefined) item.name = changes.name;
    if (changes.uom !== undefined) item.uom = changes.uom;
    if (changes.uomConversions !== undefined) item.uomConversions = changes.uomConversions;
    if (changes.barcode !== undefined) item.barcode = changes.barcode;
    if (changes.itemType !== undefined) item.itemType = changes.itemType;
    if (changes.reorderLevel !== undefined) item.reorderLevel = changes.reorderLevel;
    if (changes.reorderQty !== undefined) item.reorderQty = changes.reorderQty;
    if (changes.preferredSupplierIds !== undefined) item.preferredSupplierIds = changes.preferredSupplierIds;
    if (changes.glAssetAccountId !== undefined) item.glAssetAccountId = changes.glAssetAccountId;
    if (changes.glExpenseAccountId !== undefined) item.glExpenseAccountId = changes.glExpenseAccountId;
    if (changes.glIncomeAccountId !== undefined) item.glIncomeAccountId = changes.glIncomeAccountId;
    if (changes.salePrice !== undefined) item.salePrice = changes.salePrice;
    if (changes.isActive !== undefined) item.isActive = changes.isActive;

    this.assertResaleRequirements(item.itemType, item.salePrice, item.glIncomeAccountId);

    item.updatedBy = actorId;
    return this.itemRepository.save(item);
  }

  async findByIdOrFail(id: string): Promise<InvItemEntity> {
    return this.itemRepository.findByIdOrFail(id);
  }

  async findByCode(code: string): Promise<InvItemEntity | null> {
    return this.itemRepository.findByCode(code);
  }

  async findByBarcode(barcode: string): Promise<InvItemEntity | null> {
    return this.itemRepository.findByBarcode(barcode);
  }

  async search(query: string, limit = 20): Promise<InvItemEntity[]> {
    return this.itemRepository.searchByName(query, limit);
  }

  async list(filter: ListInvItemsFilter = {}): Promise<InvItemEntity[]> {
    return this.itemRepository.list(filter);
  }

  /** BR-INV-04 — mirrors `ck_inv_item_resale_requires_price_and_income` exactly. */
  private assertResaleRequirements(itemType: InvItemType, salePrice: Money | null, glIncomeAccountId: string | null): void {
    if (itemType === "RESALE" && (salePrice === null || glIncomeAccountId === null)) {
      throw new ValidationException(
        "BR-INV-04: a RESALE item must have both sale_price and gl_income_account_id set before it can be sold " +
          "(mirrors ck_inv_item_resale_requires_price_and_income)",
      );
    }
  }
}
