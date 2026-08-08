import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { CostCentersService } from "../application/cost-centers.service";
import { CostCenterResponseDto } from "./dto/cost-center-response.dto";
import { CreateCostCenterDto } from "./dto/create-cost-center.dto";
import { UpdateCostCenterDto } from "./dto/update-cost-center.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("accounting-cost-centers")
@Controller("accounting/cost-centers")
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Post()
  @RequirePermission("accounting:cost-center:manage")
  @ApiOperation({ summary: "Create a gl_cost_center" })
  @ApiResponse({ status: 201, type: CostCenterResponseDto })
  async create(@Body() dto: CreateCostCenterDto, @Req() req: AuthenticatedRequest): Promise<CostCenterResponseDto> {
    return this.costCentersService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  @RequirePermission("accounting:cost-center:view")
  @ApiOperation({ summary: "List cost centers" })
  @ApiResponse({ status: 200, type: [CostCenterResponseDto] })
  async list(@Query("activeOnly") activeOnly?: string): Promise<CostCenterResponseDto[]> {
    return this.costCentersService.list(activeOnly === "true");
  }

  @Get(":id")
  @RequirePermission("accounting:cost-center:view")
  @ApiOperation({ summary: "Get a cost center by id" })
  @ApiResponse({ status: 200, type: CostCenterResponseDto })
  async findOne(@Param("id") id: string): Promise<CostCenterResponseDto> {
    return this.costCentersService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("accounting:cost-center:manage")
  @ApiOperation({ summary: "Update a cost center's name" })
  @ApiResponse({ status: 200, type: CostCenterResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCostCenterDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CostCenterResponseDto> {
    return this.costCentersService.update(id, dto, req.user?.sub ?? null);
  }

  @Post(":id/deactivate")
  @RequirePermission("accounting:cost-center:manage")
  @ApiOperation({ summary: "Deactivate a cost center" })
  @ApiResponse({ status: 200, type: CostCenterResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<CostCenterResponseDto> {
    return this.costCentersService.deactivate(id, req.user?.sub ?? null);
  }

  @Post(":id/activate")
  @RequirePermission("accounting:cost-center:manage")
  @ApiOperation({ summary: "Reactivate a cost center" })
  @ApiResponse({ status: 200, type: CostCenterResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<CostCenterResponseDto> {
    return this.costCentersService.activate(id, req.user?.sub ?? null);
  }
}
