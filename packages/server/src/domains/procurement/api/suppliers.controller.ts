import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { SuppliersService } from "../application/suppliers.service";
import { SupplierRatingsService } from "../application/supplier-ratings.service";
import { ProcSupplierEntity, ProcSupplierStatus } from "../domain/proc-supplier.entity";
import { BlacklistSupplierDto, CreateSupplierDto, SetManualRatingDto, SupplierResponseDto, UpdateSupplierDto } from "./dto/supplier.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcSupplierEntity): SupplierResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    tradingName: entity.tradingName,
    kraPin: entity.kraPin,
    contacts: entity.contacts,
    paymentDetails: entity.paymentDetails,
    categories: entity.categories,
    paymentTermsDays: entity.paymentTermsDays,
    status: entity.status,
    blacklistReason: entity.blacklistReason,
    ratingDelivery: entity.ratingDelivery,
    ratingQuality: entity.ratingQuality,
    ratingManual: entity.ratingManual,
  };
}

/**
 * `proc_supplier` CRUD + search + blacklist/reactivate, plus FR-PROC-011.1
 * supplier ratings (`SupplierRatingsService`) folded in here rather than a
 * separate `supplier-ratings.controller.ts` — both operate on the same
 * `proc_supplier` row and the task brief explicitly left this "your call".
 */
@ApiTags("procurement-suppliers")
@Controller("procurement/suppliers")
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly ratingsService: SupplierRatingsService,
  ) {}

  @Post()
  @RequirePermission("procurement:supplier:manage")
  @ApiOperation({ summary: "Create a supplier" })
  @ApiResponse({ status: 201, type: SupplierResponseDto })
  async create(@Body() dto: CreateSupplierDto, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    const created = await this.suppliersService.create(
      {
        name: dto.name,
        tradingName: dto.tradingName ?? null,
        kraPin: dto.kraPin ?? null,
        contacts: dto.contacts,
        paymentDetails: dto.paymentDetails,
        categories: dto.categories,
        paymentTermsDays: dto.paymentTermsDays,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:supplier:view")
  @ApiOperation({ summary: "List suppliers, optionally filtered by status" })
  @ApiResponse({ status: 200, type: [SupplierResponseDto] })
  async list(@Query("status") status?: ProcSupplierStatus): Promise<SupplierResponseDto[]> {
    return (await this.suppliersService.list({ status })).map(toView);
  }

  @Get("search")
  @RequirePermission("procurement:supplier:view")
  @ApiOperation({ summary: "Trigram search suppliers by name (ix_proc_supplier_name_trgm)" })
  @ApiResponse({ status: 200, type: [SupplierResponseDto] })
  async search(@Query("q") q: string, @Query("limit") limit?: string): Promise<SupplierResponseDto[]> {
    return (await this.suppliersService.search(q, limit ? Number(limit) : undefined)).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:supplier:view")
  @ApiOperation({ summary: "Get a supplier by id" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async findOne(@Param("id") id: string): Promise<SupplierResponseDto> {
    return toView(await this.suppliersService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("procurement:supplier:manage")
  @ApiOperation({ summary: "Update a supplier" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateSupplierDto, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    const updated = await this.suppliersService.update(
      id,
      {
        name: dto.name,
        tradingName: dto.tradingName,
        kraPin: dto.kraPin,
        contacts: dto.contacts,
        paymentDetails: dto.paymentDetails,
        categories: dto.categories,
        paymentTermsDays: dto.paymentTermsDays,
      },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }

  @Post(":id/blacklist")
  @RequirePermission("procurement:supplier:blacklist")
  @ApiOperation({ summary: "BR-PROC-05: blacklist a supplier (blocks new POs)" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async blacklist(@Param("id") id: string, @Body() dto: BlacklistSupplierDto, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    return toView(await this.suppliersService.blacklist(id, dto.reason, req.user?.sub ?? null));
  }

  @Post(":id/reactivate")
  @RequirePermission("procurement:supplier:blacklist")
  @ApiOperation({ summary: "Reactivate a BLACKLISTED supplier" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async reactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    return toView(await this.suppliersService.reactivate(id, req.user?.sub ?? null));
  }

  @Post(":id/ratings/compute")
  @RequirePermission("procurement:rating:manage")
  @ApiOperation({ summary: "FR-PROC-011.1: recompute rating_quality from GRN rejection-rate data (rating_delivery is left untouched — see SupplierRatingsService's doc comment)" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async computeRatings(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    return toView(await this.ratingsService.computeAutoMetrics(id, req.user?.sub ?? null));
  }

  @Post(":id/ratings/manual")
  @RequirePermission("procurement:rating:manage")
  @ApiOperation({ summary: "Set a manual 1-5 rating score" })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async setManualRating(@Param("id") id: string, @Body() dto: SetManualRatingDto, @Req() req: AuthenticatedRequest): Promise<SupplierResponseDto> {
    return toView(await this.ratingsService.setManualRating(id, dto.score, req.user?.sub ?? null));
  }
}
