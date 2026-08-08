import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { CategoriesService } from "../application/categories.service";
import { InvCategoryEntity } from "../domain/inv-category.entity";
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: InvCategoryEntity): CategoryResponseDto {
  return { id: entity.id, name: entity.name, parentId: entity.parentId };
}

/** `inv_category` CRUD — hierarchical item category tree. No dedicated `...:view` code — GETs reuse `inventory:category:manage`. */
@ApiTags("inventory-categories")
@Controller("inventory/categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission("inventory:category:manage")
  @ApiOperation({ summary: "Create a category" })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(@Body() dto: CreateCategoryDto, @Req() req: AuthenticatedRequest): Promise<CategoryResponseDto> {
    const created = await this.categoriesService.create({ name: dto.name, parentId: dto.parentId ?? null }, req.user?.sub ?? null);
    return toView(created);
  }

  @Get()
  @RequirePermission("inventory:category:manage")
  @ApiOperation({ summary: "List categories, optionally filtered by parent (omit for all, empty string for root-level)" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async list(@Query("parentId") parentId?: string): Promise<CategoryResponseDto[]> {
    const rows = parentId === undefined ? await this.categoriesService.listAll() : await this.categoriesService.listByParent(parentId || null);
    return rows.map(toView);
  }

  @Get(":id")
  @RequirePermission("inventory:category:manage")
  @ApiOperation({ summary: "Get a category by id" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findOne(@Param("id") id: string): Promise<CategoryResponseDto> {
    return toView(await this.categoriesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("inventory:category:manage")
  @ApiOperation({ summary: "Update a category" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateCategoryDto, @Req() req: AuthenticatedRequest): Promise<CategoryResponseDto> {
    const updated = await this.categoriesService.update(id, { name: dto.name, parentId: dto.parentId }, req.user?.sub ?? null);
    return toView(updated);
  }
}
