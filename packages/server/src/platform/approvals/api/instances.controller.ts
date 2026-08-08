import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ApprovalEngineService } from "../application/approval-engine.service";
import { ApprActionEntity } from "../domain/appr-action.entity";
import { ApprInstanceEntity, ApprInstanceStatus } from "../domain/appr-instance.entity";
import { ActionResponseDto } from "./dto/action-response.dto";
import { DecideInstanceDto } from "./dto/decide-instance.dto";
import { InstanceDetailResponseDto } from "./dto/instance-detail-response.dto";
import { InstanceResponseDto } from "./dto/instance-response.dto";
import { AuthenticatedRequest, SYSTEM_ADMIN_ROLE_NAME } from "./request-context";

function toInstanceView(entity: ApprInstanceEntity): InstanceResponseDto {
  return { ...entity, amount: entity.amount ? entity.amount.toDecimalString() : null } as unknown as InstanceResponseDto;
}

function toActionView(entity: ApprActionEntity): ActionResponseDto {
  return entity;
}

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sub;
}

/**
 * `appr_instance` read surface + the two decision endpoints. Deliberately
 * **no `POST /approvals/instances` submit endpoint** — submission
 * (`ApprovalEngineService.submit()`) is always an internal service call
 * composed into another module's own business transaction, never a
 * standalone HTTP call; see that method's doc comment for the full
 * rationale (same reasoning as `NumberingService.allocate()` never being
 * exposed as an endpoint either).
 *
 * `cancel()` is intentionally NOT `@RequirePermission`-guarded — it is
 * self-service for the initiator (mirrors `DeviceTokensController`'s
 * self-service endpoints, which also carry no permission guard beyond
 * authentication), with an "or a privileged admin" escape hatch resolved
 * from `req.user.roles` containing `"System Admin"`. This is a pragmatic
 * stand-in: this codebase's JWT claims carry `roles: string[]` and a
 * `permsHash` (not the resolved permission list itself), so there is no
 * cheap way today to ask "does this caller hold `approvals:instance:decide`"
 * from inside a controller method without a second guard/lookup. Revisit
 * once a resolved-permission-set-on-request mechanism exists.
 */
@ApiTags("approvals-instances")
@Controller("approvals/instances")
export class InstancesController {
  constructor(private readonly approvalEngine: ApprovalEngineService) {}

  @Get()
  @RequirePermission("approvals:instance:view")
  @ApiOperation({ summary: "List approval instances, optionally filtered by status/domainCode" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "domainCode", required: false })
  @ApiResponse({ status: 200, type: [InstanceResponseDto] })
  async list(
    @Query("status") status?: ApprInstanceStatus,
    @Query("domainCode") domainCode?: string,
  ): Promise<InstanceResponseDto[]> {
    return (await this.approvalEngine.list({ status, domainCode })).map(toInstanceView);
  }

  @Get("inbox")
  @RequirePermission("approvals:instance:view")
  @ApiOperation({ summary: "PENDING instances currently actionable by the caller (approval inbox)" })
  @ApiResponse({ status: 200, type: [InstanceResponseDto] })
  async inbox(@Req() req: AuthenticatedRequest): Promise<InstanceResponseDto[]> {
    const userId = requireUserId(req);
    return (await this.approvalEngine.listPendingForApprover(userId)).map(toInstanceView);
  }

  @Get(":id")
  @RequirePermission("approvals:instance:view")
  @ApiOperation({ summary: "Get an approval instance, including its full decision trail" })
  @ApiResponse({ status: 200, type: InstanceDetailResponseDto })
  async findOne(@Param("id") id: string): Promise<InstanceDetailResponseDto> {
    const instance = await this.approvalEngine.findByIdOrFail(id);
    const actions = await this.approvalEngine.getActionHistory(id);
    return { ...toInstanceView(instance), actions: actions.map(toActionView) };
  }

  @Post(":id/decide")
  @RequirePermission("approvals:instance:decide")
  @ApiOperation({ summary: "Record APPROVE/REJECT/RETURN for the caller at the instance's current level" })
  @ApiResponse({ status: 200, type: InstanceResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideInstanceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InstanceResponseDto> {
    const userId = requireUserId(req);
    return toInstanceView(await this.approvalEngine.decide(id, userId, dto.decision, dto.comment ?? null));
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a still-PENDING instance — initiator self-service, or a System Admin" })
  @ApiResponse({ status: 200, type: InstanceResponseDto })
  async cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<InstanceResponseDto> {
    const userId = requireUserId(req);
    const isPrivileged = req.user?.roles?.includes(SYSTEM_ADMIN_ROLE_NAME) ?? false;
    return toInstanceView(await this.approvalEngine.cancel(id, userId, isPrivileged));
  }
}
