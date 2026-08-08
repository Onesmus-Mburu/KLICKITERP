import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { CategoriesService } from "../application/categories.service";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ExpCategoryEntity): CategoryResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId,
    glExpenseAccountId: entity.glExpenseAccountId,
    budgetRequired: entity.budgetRequired,
    isActive: entity.isActive,
  };
}

/** `exp_category` CRUD — BR-EXP-01 (a GL-account-linked category every voucher/petty-cash-voucher/claim-line resolves to). */
@ApiTags("expenses-categories")
@Controller("expenses/categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission("expenses:category:manage")
  @ApiOperation({ summary: "Create an expense category (BR-EXP-01: requires a valid, active, postable EXPENSE-class gl_expense_account_id)" })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(@Body() dto: CreateCategoryDto, @Req() req: AuthenticatedRequest): Promise<CategoryResponseDto> {
    const created = await this.categoriesService.create(
      {
        name: dto.name,
        parentId: dto.parentId ?? null,
        glExpenseAccountId: dto.glExpenseAccountId,
        budgetRequired: dto.budgetRequired,
        isActive: dto.isActive,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("expenses:category:manage")
  @ApiOperation({ summary: "List categories, optionally filtered by parentId (pass 'null' for root categories)" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async list(@Query("parentId") parentId?: string): Promise<CategoryResponseDto[]> {
    const filter = parentId === undefined ? undefined : parentId === "null" ? null : parentId;
    return (await this.categoriesService.list(filter)).map(toView);
  }

  @Get(":id")
  @RequirePermission("expenses:category:manage")
  @ApiOperation({ summary: "Get a category by id" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findOne(@Param("id") id: string): Promise<CategoryResponseDto> {
    return toView(await this.categoriesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("expenses:category:manage")
  @ApiOperation({ summary: "Update a category" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateCategoryDto, @Req() req: AuthenticatedRequest): Promise<CategoryResponseDto> {
    const updated = await this.categoriesService.update(id, dto, req.user?.sub ?? null);
    return toView(updated);
  }
}
