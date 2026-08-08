import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { ItemsService } from "../application/items.service";
import { InvItemEntity, InvItemType } from "../domain/inv-item.entity";
import { CreateItemDto, ItemResponseDto, UpdateItemDto } from "./dto/item.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: InvItemEntity): ItemResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    categoryId: entity.categoryId,
    uom: entity.uom,
    barcode: entity.barcode,
    itemType: entity.itemType,
    reorderLevel: entity.reorderLevel,
    reorderQty: entity.reorderQty,
    glAssetAccountId: entity.glAssetAccountId,
    glExpenseAccountId: entity.glExpenseAccountId,
    glIncomeAccountId: entity.glIncomeAccountId,
    salePrice: entity.salePrice ? entity.salePrice.toDecimalString() : null,
    avgCost: entity.avgCost,
    isActive: entity.isActive,
  };
}

/** `inv_item` CRUD + search/barcode-lookup — BR-INV-04 enforced by `ItemsService`. */
@ApiTags("inventory-items")
@Controller("inventory/items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermission("inventory:item:manage")
  @ApiOperation({ summary: "Create an item (BR-INV-04: RESALE requires sale_price + gl_income_account_id)" })
  @ApiResponse({ status: 201, type: ItemResponseDto })
  async create(@Body() dto: CreateItemDto, @Req() req: AuthenticatedRequest): Promise<ItemResponseDto> {
    const created = await this.itemsService.create(
      {
        code: dto.code,
        name: dto.name,
        categoryId: dto.categoryId,
        uom: dto.uom,
        uomConversions: dto.uomConversions ?? null,
        barcode: dto.barcode ?? null,
        itemType: dto.itemType,
        reorderLevel: dto.reorderLevel ?? null,
        reorderQty: dto.reorderQty ?? null,
        preferredSupplierIds: dto.preferredSupplierIds ?? null,
        glAssetAccountId: dto.glAssetAccountId,
        glExpenseAccountId: dto.glExpenseAccountId,
        glIncomeAccountId: dto.glIncomeAccountId ?? null,
        salePrice: dto.salePrice ? Money.fromDecimalString(dto.salePrice) : null,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get("search")
  @RequirePermission("inventory:item:view")
  @ApiOperation({ summary: "Trigram similarity search by name" })
  @ApiResponse({ status: 200, type: [ItemResponseDto] })
  async search(@Query("q") q: string, @Query("limit") limit?: string): Promise<ItemResponseDto[]> {
    return (await this.itemsService.search(q, limit ? Number(limit) : undefined)).map(toView);
  }

  @Get("barcode/:barcode")
  @RequirePermission("inventory:item:view")
  @ApiOperation({ summary: "Barcode scanner lookup (POS/GRN)" })
  @ApiResponse({ status: 200, type: ItemResponseDto })
  async findByBarcode(@Param("barcode") barcode: string): Promise<ItemResponseDto | null> {
    const item = await this.itemsService.findByBarcode(barcode);
    return item ? toView(item) : null;
  }

  @Get()
  @RequirePermission("inventory:item:view")
  @ApiOperation({ summary: "List items, optionally filtered by category/type/active" })
  @ApiResponse({ status: 200, type: [ItemResponseDto] })
  async list(
    @Query("categoryId") categoryId?: string,
    @Query("itemType") itemType?: InvItemType,
    @Query("isActive") isActive?: string,
  ): Promise<ItemResponseDto[]> {
    const filter = {
      categoryId,
      itemType,
      isActive: isActive === undefined ? undefined : isActive === "true",
    };
    return (await this.itemsService.list(filter)).map(toView);
  }

  @Get(":id")
  @RequirePermission("inventory:item:view")
  @ApiOperation({ summary: "Get an item by id" })
  @ApiResponse({ status: 200, type: ItemResponseDto })
  async findOne(@Param("id") id: string): Promise<ItemResponseDto> {
    return toView(await this.itemsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("inventory:item:manage")
  @ApiOperation({ summary: "Update an item (BR-INV-04 re-checked)" })
  @ApiResponse({ status: 200, type: ItemResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateItemDto, @Req() req: AuthenticatedRequest): Promise<ItemResponseDto> {
    const updated = await this.itemsService.update(
      id,
      {
        name: dto.name,
        categoryId: dto.categoryId,
        uom: dto.uom,
        uomConversions: dto.uomConversions,
        barcode: dto.barcode,
        itemType: dto.itemType,
        reorderLevel: dto.reorderLevel,
        reorderQty: dto.reorderQty,
        preferredSupplierIds: dto.preferredSupplierIds,
        glAssetAccountId: dto.glAssetAccountId,
        glExpenseAccountId: dto.glExpenseAccountId,
        glIncomeAccountId: dto.glIncomeAccountId,
        salePrice: dto.salePrice !== undefined ? Money.fromDecimalString(dto.salePrice) : undefined,
        isActive: dto.isActive,
      },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }
}
