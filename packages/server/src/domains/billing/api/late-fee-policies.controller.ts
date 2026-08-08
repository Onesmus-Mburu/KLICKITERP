import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { LateFeePoliciesService } from "../application/late-fee-policies.service";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";
import { CreateLateFeePolicyDto, LateFeePolicyResponseDto, UpdateLateFeePolicyDto } from "./dto/late-fee-policy.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillLateFeePolicyEntity): LateFeePolicyResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    mode: entity.mode,
    params: entity.params,
    graceDays: entity.graceDays,
    requiresApproval: entity.requiresApproval,
    isActive: entity.isActive,
  };
}

@ApiTags("billing-late-fee-policies")
@Controller("billing/late-fee-policies")
export class LateFeePoliciesController {
  constructor(private readonly service: LateFeePoliciesService) {}

  @Post()
  @RequirePermission("billing:late-fee-policy:manage")
  @ApiOperation({ summary: "Create a bill_late_fee_policy (BR-BILL-10/BR-BILL-11)" })
  @ApiResponse({ status: 201, type: LateFeePolicyResponseDto })
  async create(@Body() dto: CreateLateFeePolicyDto, @Req() req: AuthenticatedRequest): Promise<LateFeePolicyResponseDto> {
    return toView(
      await this.service.create(
        { name: dto.name, mode: dto.mode, params: dto.params, graceDays: dto.graceDays, requiresApproval: dto.requiresApproval },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:late-fee-policy:view")
  @ApiOperation({ summary: "List late-fee policies" })
  @ApiResponse({ status: 200, type: [LateFeePolicyResponseDto] })
  async list(): Promise<LateFeePolicyResponseDto[]> {
    return (await this.service.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:late-fee-policy:view")
  @ApiOperation({ summary: "Get a late-fee policy by id" })
  @ApiResponse({ status: 200, type: LateFeePolicyResponseDto })
  async findOne(@Param("id") id: string): Promise<LateFeePolicyResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:late-fee-policy:manage")
  @ApiOperation({ summary: "Update a late-fee policy" })
  @ApiResponse({ status: 200, type: LateFeePolicyResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateLateFeePolicyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LateFeePolicyResponseDto> {
    return toView(await this.service.update(id, dto, req.user?.sub ?? null));
  }

  @Post(":id/deactivate")
  @RequirePermission("billing:late-fee-policy:manage")
  @ApiOperation({ summary: "Deactivate a late-fee policy" })
  @ApiResponse({ status: 200, type: LateFeePolicyResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<LateFeePolicyResponseDto> {
    return toView(await this.service.deactivate(id, req.user?.sub ?? null));
  }

  @Post(":id/activate")
  @RequirePermission("billing:late-fee-policy:manage")
  @ApiOperation({ summary: "Reactivate a late-fee policy" })
  @ApiResponse({ status: 200, type: LateFeePolicyResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<LateFeePolicyResponseDto> {
    return toView(await this.service.activate(id, req.user?.sub ?? null));
  }
}
