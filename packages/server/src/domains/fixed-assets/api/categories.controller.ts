import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { CategoriesService } from "../application/categories.service";
import { FaCategoryEntity } from "../domain/fa-category.entity";
import { CreateFaCategoryDto, FaCategoryResponseDto, UpdateFaCategoryDto } from "./dto/category.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaCategoryEntity): FaCategoryResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    method: entity.method,
    lifeMonths: entity.lifeMonths,
    rate: entity.rate,
    residualPct: entity.residualPct,
    glCostAccountId: entity.glCostAccountId,
    glAccumDepAccountId: entity.glAccumDepAccountId,
    glDepExpenseAccountId: entity.glDepExpenseAccountId,
  };
}

/** `fa_category` CRUD — the depreciation-policy bucket every `fa_asset` belongs to. */
@ApiTags("fixed-assets-categories")
@Controller("fixed-assets/categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission("fixed-assets:category:manage")
  @ApiOperation({ summary: "Create a fixed-asset category (requires all 3 GL account mappings)" })
  @ApiResponse({ status: 201, type: FaCategoryResponseDto })
  async create(@Body() dto: CreateFaCategoryDto, @Req() req: AuthenticatedRequest): Promise<FaCategoryResponseDto> {
    const category = await this.categoriesService.create(dto, req.user?.sub ?? null);
    return toView(category);
  }

  @Get()
  @RequirePermission("fixed-assets:category:manage")
  @ApiOperation({ summary: "List fixed-asset categories" })
  @ApiResponse({ status: 200, type: [FaCategoryResponseDto] })
  async list(): Promise<FaCategoryResponseDto[]> {
    return (await this.categoriesService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:category:manage")
  @ApiOperation({ summary: "Get a fixed-asset category by id" })
  @ApiResponse({ status: 200, type: FaCategoryResponseDto })
  async findOne(@Param("id") id: string): Promise<FaCategoryResponseDto> {
    return toView(await this.categoriesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("fixed-assets:category:manage")
  @ApiOperation({ summary: "Update a fixed-asset category" })
  @ApiResponse({ status: 200, type: FaCategoryResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateFaCategoryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaCategoryResponseDto> {
    const category = await this.categoriesService.update(id, dto, req.user?.sub ?? null);
    return toView(category);
  }
}
