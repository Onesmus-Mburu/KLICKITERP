import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { DelegationsService } from "../application/delegations.service";
import { ApprDelegationEntity } from "../domain/appr-delegation.entity";
import { CreateDelegationDto } from "./dto/create-delegation.dto";
import { DelegationResponseDto } from "./dto/delegation-response.dto";
import { UpdateDelegationDto } from "./dto/update-delegation.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ApprDelegationEntity): DelegationResponseDto {
  return entity;
}

/** `appr_delegation` CRUD (FR-APPR-005.1) — date-bounded approval-authority delegation. */
@ApiTags("approvals-delegations")
@Controller("approvals/delegations")
export class DelegationsController {
  constructor(private readonly delegationsService: DelegationsService) {}

  @Post()
  @RequirePermission("approvals:delegation:manage")
  @ApiOperation({ summary: "Create a date-bounded delegation" })
  @ApiResponse({ status: 201, type: DelegationResponseDto })
  async create(
    @Body() dto: CreateDelegationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DelegationResponseDto> {
    return toView(await this.delegationsService.create(dto, req.user?.sub ?? null));
  }

  @Get()
  @RequirePermission("approvals:delegation:view")
  @ApiOperation({ summary: "List delegations" })
  @ApiResponse({ status: 200, type: [DelegationResponseDto] })
  async list(): Promise<DelegationResponseDto[]> {
    return (await this.delegationsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("approvals:delegation:view")
  @ApiOperation({ summary: "Get a delegation by id" })
  @ApiResponse({ status: 200, type: DelegationResponseDto })
  async findOne(@Param("id") id: string): Promise<DelegationResponseDto> {
    return toView(await this.delegationsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("approvals:delegation:manage")
  @ApiOperation({ summary: "Update a delegation's date range/reason" })
  @ApiResponse({ status: 200, type: DelegationResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateDelegationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DelegationResponseDto> {
    return toView(await this.delegationsService.update(id, dto, req.user?.sub ?? null));
  }

  @Delete(":id")
  @RequirePermission("approvals:delegation:manage")
  @ApiOperation({ summary: "Delete a delegation" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: true }> {
    await this.delegationsService.delete(id);
    return { deleted: true };
  }
}
