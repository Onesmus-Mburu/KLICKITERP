import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { AssetsService } from "../application/assets.service";
import { FaAssetEntity, FaAssetStatus } from "../domain/fa-asset.entity";
import { CreateFaAssetDto, FaAssetResponseDto, UpdateFaAssetConditionDto, UpdateFaAssetDto } from "./dto/asset.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaAssetEntity): FaAssetResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    categoryId: entity.categoryId,
    serialNo: entity.serialNo,
    barcode: entity.barcode,
    location: entity.location,
    custodianUserId: entity.custodianUserId,
    acquisitionDate: entity.acquisitionDate,
    cost: entity.cost.toDecimalString(),
    fundingSource: entity.fundingSource,
    supplierId: entity.supplierId,
    poId: entity.poId,
    grnId: entity.grnId,
    inServiceFrom: entity.inServiceFrom,
    lifeMonthsOverride: entity.lifeMonthsOverride,
    residualValue: entity.residualValue.toDecimalString(),
    accumDepreciation: entity.accumDepreciation.toDecimalString(),
    status: entity.status,
    insurance: entity.insurance,
    condition: entity.condition,
    photos: entity.photos,
  };
}

/** `fa_asset` CRUD — the asset register (FR-FA-001.1), plus search/barcode-lookup and condition updates. */
@ApiTags("fixed-assets-assets")
@Controller("fixed-assets/assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @RequirePermission("fixed-assets:asset:manage")
  @ApiOperation({ summary: "Register a fixed asset (residual_value derived from category.residual_pct × cost when omitted)" })
  @ApiResponse({ status: 201, type: FaAssetResponseDto })
  async create(@Body() dto: CreateFaAssetDto, @Req() req: AuthenticatedRequest): Promise<FaAssetResponseDto> {
    const asset = await this.assetsService.create(
      {
        code: dto.code,
        name: dto.name,
        categoryId: dto.categoryId,
        serialNo: dto.serialNo ?? null,
        barcode: dto.barcode ?? null,
        location: dto.location,
        custodianUserId: dto.custodianUserId ?? null,
        acquisitionDate: dto.acquisitionDate,
        cost: Money.fromDecimalString(dto.cost),
        fundingSource: dto.fundingSource,
        supplierId: dto.supplierId ?? null,
        poId: dto.poId ?? null,
        grnId: dto.grnId ?? null,
        inServiceFrom: dto.inServiceFrom,
        lifeMonthsOverride: dto.lifeMonthsOverride ?? null,
        residualValue: dto.residualValue !== undefined ? Money.fromDecimalString(dto.residualValue) : null,
        insurance: dto.insurance ?? null,
        condition: dto.condition,
        photos: dto.photos ?? null,
      },
      req.user?.sub ?? null,
    );
    return toView(asset);
  }

  @Get()
  @RequirePermission("fixed-assets:asset:view")
  @ApiOperation({ summary: "List assets, optionally filtered by category/status/custodian" })
  @ApiResponse({ status: 200, type: [FaAssetResponseDto] })
  async list(
    @Query("categoryId") categoryId?: string,
    @Query("status") status?: FaAssetStatus,
    @Query("custodianUserId") custodianUserId?: string,
  ): Promise<FaAssetResponseDto[]> {
    return (await this.assetsService.list({ categoryId, status, custodianUserId })).map(toView);
  }

  @Get("search")
  @RequirePermission("fixed-assets:asset:view")
  @ApiOperation({ summary: "Search assets by code or barcode (ILIKE substring match)" })
  @ApiResponse({ status: 200, type: [FaAssetResponseDto] })
  async search(@Query("q") q: string): Promise<FaAssetResponseDto[]> {
    return (await this.assetsService.search(q)).map(toView);
  }

  @Get("barcode/:barcode")
  @RequirePermission("fixed-assets:asset:view")
  @ApiOperation({ summary: "Find an asset by exact barcode (scanner lookup)" })
  @ApiResponse({ status: 200, type: FaAssetResponseDto })
  async findByBarcode(@Param("barcode") barcode: string): Promise<FaAssetResponseDto> {
    const asset = await this.assetsService.findByBarcode(barcode);
    if (!asset) throw new NotFoundException("FaAsset", `barcode:${barcode}`);
    return toView(asset);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:asset:view")
  @ApiOperation({ summary: "Get an asset by id" })
  @ApiResponse({ status: 200, type: FaAssetResponseDto })
  async findOne(@Param("id") id: string): Promise<FaAssetResponseDto> {
    return toView(await this.assetsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("fixed-assets:asset:manage")
  @ApiOperation({ summary: "Update an asset's register fields" })
  @ApiResponse({ status: 200, type: FaAssetResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateFaAssetDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaAssetResponseDto> {
    const asset = await this.assetsService.update(
      id,
      {
        name: dto.name,
        categoryId: dto.categoryId,
        serialNo: dto.serialNo,
        barcode: dto.barcode,
        location: dto.location,
        custodianUserId: dto.custodianUserId,
        lifeMonthsOverride: dto.lifeMonthsOverride,
        residualValue: dto.residualValue !== undefined ? Money.fromDecimalString(dto.residualValue) : undefined,
        insurance: dto.insurance,
        condition: dto.condition,
        photos: dto.photos,
      },
      req.user?.sub ?? null,
    );
    return toView(asset);
  }

  @Patch(":id/condition")
  @RequirePermission("fixed-assets:asset:manage")
  @ApiOperation({ summary: "Update only an asset's condition (verification/inspection entry point)" })
  @ApiResponse({ status: 200, type: FaAssetResponseDto })
  async updateCondition(
    @Param("id") id: string,
    @Body() dto: UpdateFaAssetConditionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaAssetResponseDto> {
    const asset = await this.assetsService.updateCondition(id, dto.condition, req.user?.sub ?? null);
    return toView(asset);
  }
}
