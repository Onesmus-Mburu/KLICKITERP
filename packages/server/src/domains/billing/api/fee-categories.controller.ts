import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { FeeCategoriesService } from "../application/fee-categories.service";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { CreateFeeCategoryDto, FeeCategoryResponseDto, UpdateFeeCategoryDto } from "./dto/fee-category.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillFeeCategoryEntity): FeeCategoryResponseDto {
  return entity;
}

@ApiTags("billing-fee-categories")
@Controller("billing/fee-categories")
export class FeeCategoriesController {
  constructor(private readonly service: FeeCategoriesService) {}

  @Post()
  @RequirePermission("billing:fee-category:manage")
  @ApiOperation({ summary: "Create a bill_fee_category" })
  @ApiResponse({ status: 201, type: FeeCategoryResponseDto })
  async create(@Body() dto: CreateFeeCategoryDto, @Req() req: AuthenticatedRequest): Promise<FeeCategoryResponseDto> {
    return toView(
      await this.service.create(
        { name: dto.name, glIncomeAccountId: dto.glIncomeAccountId, taxable: dto.taxable, priority: dto.priority },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:fee-category:view")
  @ApiOperation({ summary: "List fee categories" })
  @ApiResponse({ status: 200, type: [FeeCategoryResponseDto] })
  async list(): Promise<FeeCategoryResponseDto[]> {
    return (await this.service.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:fee-category:view")
  @ApiOperation({ summary: "Get a fee category by id" })
  @ApiResponse({ status: 200, type: FeeCategoryResponseDto })
  async findOne(@Param("id") id: string): Promise<FeeCategoryResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:fee-category:manage")
  @ApiOperation({ summary: "Update a fee category" })
  @ApiResponse({ status: 200, type: FeeCategoryResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateFeeCategoryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FeeCategoryResponseDto> {
    return toView(await this.service.update(id, dto, req.user?.sub ?? null));
  }

  @Post(":id/deactivate")
  @RequirePermission("billing:fee-category:manage")
  @ApiOperation({ summary: "Deactivate a fee category" })
  @ApiResponse({ status: 200, type: FeeCategoryResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FeeCategoryResponseDto> {
    return toView(await this.service.deactivate(id, req.user?.sub ?? null));
  }

  @Post(":id/activate")
  @RequirePermission("billing:fee-category:manage")
  @ApiOperation({ summary: "Reactivate a fee category" })
  @ApiResponse({ status: 200, type: FeeCategoryResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FeeCategoryResponseDto> {
    return toView(await this.service.activate(id, req.user?.sub ?? null));
  }
}
