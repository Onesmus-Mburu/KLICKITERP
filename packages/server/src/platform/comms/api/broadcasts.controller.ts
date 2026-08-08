import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { AudienceDef, BroadcastsService } from "../application/broadcasts.service";
import { CommBroadcastEntity } from "../domain/comm-broadcast.entity";
import { BroadcastResponseDto } from "./dto/broadcast-response.dto";
import { CreateBroadcastDto } from "./dto/create-broadcast.dto";
import { SubmitBroadcastApprovalDto } from "./dto/submit-broadcast-approval.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: CommBroadcastEntity): BroadcastResponseDto {
  return { ...entity, estCostAmount: entity.estCostAmount.toDecimalString() } as unknown as BroadcastResponseDto;
}

/**
 * `comm_broadcast` CRUD + the DRAFT -> PENDING_APPROVAL -> APPROVED ->
 * SENDING -> SENT (or -> CANCELLED) state machine — see
 * `BroadcastsService`'s doc comment. `submitForApproval`/`send` are the only
 * endpoints that fan out real work; `approve`/`cancel` stand in for the real
 * Module 6 (Approvals) decision until that module exists.
 */
@ApiTags("comms-broadcasts")
@Controller("comms/broadcasts")
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Post()
  @RequirePermission("comms:broadcast:create")
  @ApiOperation({ summary: "Create a broadcast (starts as DRAFT)" })
  @ApiResponse({ status: 201, type: BroadcastResponseDto })
  async create(@Body() dto: CreateBroadcastDto, @Req() req: AuthenticatedRequest): Promise<BroadcastResponseDto> {
    const created = await this.broadcastsService.create(
      {
        title: dto.title,
        audienceDef: dto.audienceDef as AudienceDef,
        channel: dto.channel,
        body: dto.body,
        estCostAmount: dto.estCostAmount ? Money.fromDecimalString(dto.estCostAmount) : undefined,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("comms:broadcast:view")
  @ApiOperation({ summary: "List broadcasts" })
  @ApiResponse({ status: 200, type: [BroadcastResponseDto] })
  async list(): Promise<BroadcastResponseDto[]> {
    return (await this.broadcastsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("comms:broadcast:view")
  @ApiOperation({ summary: "Get a broadcast by id" })
  @ApiResponse({ status: 200, type: BroadcastResponseDto })
  async findOne(@Param("id") id: string): Promise<BroadcastResponseDto> {
    return toView(await this.broadcastsService.findByIdOrFail(id));
  }

  @Post(":id/submit-for-approval")
  @RequirePermission("comms:broadcast:approve-submit")
  @ApiOperation({
    summary: "DRAFT -> PENDING_APPROVAL",
    description:
      "Stores the caller-supplied approval_ref. The real appr_* approval workflow engine is Module 6 (Approvals), " +
      "not built yet — this endpoint does not validate or resolve the reference against anything.",
  })
  @ApiResponse({ status: 200, type: BroadcastResponseDto })
  async submitForApproval(
    @Param("id") id: string,
    @Body() dto: SubmitBroadcastApprovalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BroadcastResponseDto> {
    return toView(await this.broadcastsService.submitForApproval(id, dto.approvalRef, req.user?.sub ?? null));
  }

  @Post(":id/approve")
  @RequirePermission("comms:broadcast:approve-submit")
  @ApiOperation({
    summary: "PENDING_APPROVAL -> APPROVED",
    description: "Stands in for the real approval decision until Module 6 (Approvals) lands.",
  })
  @ApiResponse({ status: 200, type: BroadcastResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BroadcastResponseDto> {
    return toView(await this.broadcastsService.approve(id, req.user?.sub ?? null));
  }

  @Post(":id/cancel")
  @RequirePermission("comms:broadcast:approve-submit")
  @ApiOperation({ summary: "Any pre-SENDING state -> CANCELLED" })
  @ApiResponse({ status: 200, type: BroadcastResponseDto })
  async cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BroadcastResponseDto> {
    return toView(await this.broadcastsService.cancel(id, req.user?.sub ?? null));
  }

  @Post(":id/send")
  @RequirePermission("comms:broadcast:send")
  @ApiOperation({
    summary: "APPROVED -> SENDING -> SENT — resolves the audience and fans out one comm_message per recipient",
  })
  @ApiResponse({ status: 200, type: BroadcastResponseDto })
  async send(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BroadcastResponseDto> {
    return toView(await this.broadcastsService.send(id, req.user?.sub ?? null));
  }
}
