import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { FeeGroupsService } from "../application/fee-groups.service";
import { CreateFeeGroupDto } from "./dto/create-fee-group.dto";
import { FeeGroupResponseDto } from "./dto/fee-group-response.dto";
import { UpdateFeeGroupDto } from "./dto/update-fee-group.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("students-fee-groups")
@Controller("students/fee-groups")
export class FeeGroupsController {
  constructor(private readonly feeGroupsService: FeeGroupsService) {}

  @Post()
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Create a std_fee_group" })
  @ApiResponse({ status: 201, type: FeeGroupResponseDto })
  async create(@Body() dto: CreateFeeGroupDto, @Req() req: AuthenticatedRequest): Promise<FeeGroupResponseDto> {
    return this.feeGroupsService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "List fee groups" })
  @ApiResponse({ status: 200, type: [FeeGroupResponseDto] })
  async list(): Promise<FeeGroupResponseDto[]> {
    return this.feeGroupsService.list();
  }

  @Get(":id")
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "Get a fee group by id" })
  @ApiResponse({ status: 200, type: FeeGroupResponseDto })
  async findOne(@Param("id") id: string): Promise<FeeGroupResponseDto> {
    return this.feeGroupsService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Update a fee group" })
  @ApiResponse({ status: 200, type: FeeGroupResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateFeeGroupDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FeeGroupResponseDto> {
    return this.feeGroupsService.update(id, dto, req.user?.sub ?? null);
  }
}
