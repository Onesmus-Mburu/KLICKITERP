import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { LateFeeBatchesService } from "../application/late-fee-batches.service";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";
import { DecideLateFeeBatchDto, LateFeeBatchResponseDto, RunLateFeeBatchDto } from "./dto/late-fee-batch.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillLateFeeBatchEntity): LateFeeBatchResponseDto {
  return {
    id: entity.id,
    policyId: entity.policyId,
    runDate: entity.runDate,
    status: entity.status,
    approvalRef: entity.approvalRef,
    summary: entity.summary,
  };
}

/** `bill_late_fee_batch` — FR-BILL-025.1/FR-BILL-026.1's execution engine. No scheduler exists in this codebase; `run` is this pass's manual trigger for what should eventually be a nightly job. */
@ApiTags("billing-late-fee-batches")
@Controller("billing/late-fee-batches")
export class LateFeeBatchesController {
  constructor(
    private readonly service: LateFeeBatchesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("run")
  @RequirePermission("billing:late-fee-batch:run")
  @ApiOperation({ summary: "Run a late-fee policy across the overdue population, aggregating a bill_late_fee_batch" })
  @ApiResponse({ status: 201, type: LateFeeBatchResponseDto })
  async run(@Body() dto: RunLateFeeBatchDto, @Req() req: AuthenticatedRequest): Promise<LateFeeBatchResponseDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("LateFeeBatchesController.run: no authenticated user on request");
    return toView(await this.service.runBatch(dto.policyId, dto.runDate, initiatedBy));
  }

  @Get()
  @RequirePermission("billing:late-fee-batch:view")
  @ApiOperation({ summary: "List late-fee batches for a policy" })
  @ApiResponse({ status: 200, type: [LateFeeBatchResponseDto] })
  async list(@Query("policyId") policyId: string): Promise<LateFeeBatchResponseDto[]> {
    return (await this.service.listByPolicy(policyId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:late-fee-batch:view")
  @ApiOperation({ summary: "Get a late-fee batch by id" })
  @ApiResponse({ status: 200, type: LateFeeBatchResponseDto })
  async findOne(@Param("id") id: string): Promise<LateFeeBatchResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Post(":id/decide")
  @RequirePermission("billing:late-fee-batch:run")
  @ApiOperation({ summary: "Approve (posts immediately) or reject (reverts to DRAFT) a PENDING_APPROVAL late-fee batch" })
  @ApiResponse({ status: 200, type: LateFeeBatchResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideLateFeeBatchDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LateFeeBatchResponseDto> {
    const actorId = req.user?.sub;
    if (!actorId) throw new Error("LateFeeBatchesController.decide: no authenticated user on request");
    return toView(await this.service.onApprovalDecided(id, dto.approved, actorId));
  }

  @Post(":id/post")
  @RequirePermission("billing:late-fee-batch:run")
  @ApiOperation({ summary: "Post a DRAFT/PENDING_APPROVAL late-fee batch (realizes P-05 via InvoicingService)" })
  @ApiResponse({ status: 200, type: LateFeeBatchResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<LateFeeBatchResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) throw new Error("LateFeeBatchesController.post: no authenticated user on request");
    const batch = await runInTransaction(this.dataSource, (manager) => this.service.post(manager, id, postedBy));
    return toView(batch);
  }
}
