import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { DepreciationRunsService } from "../application/depreciation-runs.service";
import { FaDepreciationRunEntity, FaDepreciationRunStatus } from "../domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";
import {
  CreateFaDepreciationRunDto,
  DecideFaDepreciationRunDto,
  FaDepreciationLineResponseDto,
  FaDepreciationRunResponseDto,
} from "./dto/depreciation-run.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaDepreciationRunEntity): FaDepreciationRunResponseDto {
  return {
    id: entity.id,
    periodId: entity.periodId,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function toLineView(entity: FaDepreciationLineEntity): FaDepreciationLineResponseDto {
  return {
    id: entity.id,
    runId: entity.runId,
    assetId: entity.assetId,
    amount: entity.amount.toDecimalString(),
    nbvAfter: entity.nbvAfter.toDecimalString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`DepreciationRunsController.${action}: no authenticated user on request`);
  return userId;
}

/** `fa_depreciation_run` (+lines) — the monthly depreciation engine (FR-FA-003.1, BR-FA-01): create -> submit (DEPRECIATION approval) -> decide -> post (P-30). */
@ApiTags("fixed-assets-depreciation-runs")
@Controller("fixed-assets/depreciation-runs")
export class DepreciationRunsController {
  constructor(
    private readonly depreciationRunsService: DepreciationRunsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("fixed-assets:depreciation:run")
  @ApiOperation({ summary: "Create+compute a DRAFT depreciation run for a gl_period (SL/RB, prorated, BR-FA-01 capped)" })
  @ApiResponse({ status: 201, type: FaDepreciationRunResponseDto })
  async create(@Body() dto: CreateFaDepreciationRunDto, @Req() req: AuthenticatedRequest): Promise<FaDepreciationRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.depreciationRunsService.createRun(manager, dto.periodId, req.user?.sub ?? null),
    );
    return toView(run);
  }

  @Get()
  @RequirePermission("fixed-assets:depreciation:run")
  @ApiOperation({ summary: "List depreciation runs, optionally filtered by status" })
  @ApiResponse({ status: 200, type: [FaDepreciationRunResponseDto] })
  async list(@Query("status") status?: FaDepreciationRunStatus): Promise<FaDepreciationRunResponseDto[]> {
    return (await this.depreciationRunsService.list({ status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:depreciation:run")
  @ApiOperation({ summary: "Get a depreciation run by id" })
  @ApiResponse({ status: 200, type: FaDepreciationRunResponseDto })
  async findOne(@Param("id") id: string): Promise<FaDepreciationRunResponseDto> {
    return toView(await this.depreciationRunsService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("fixed-assets:depreciation:run")
  @ApiOperation({ summary: "List a run's computed per-asset lines" })
  @ApiResponse({ status: 200, type: [FaDepreciationLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<FaDepreciationLineResponseDto[]> {
    return (await this.depreciationRunsService.listLines(id)).map(toLineView);
  }

  @Post(":id/submit")
  @RequirePermission("fixed-assets:depreciation:run")
  @ApiOperation({ summary: "Submit a DRAFT run for DEPRECIATION approval" })
  @ApiResponse({ status: 200, type: FaDepreciationRunResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaDepreciationRunResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.depreciationRunsService.submitForApproval(manager, id, initiatorId),
    );
    return toView(run);
  }

  @Post(":id/decide")
  @RequirePermission("fixed-assets:depreciation:decide")
  @ApiOperation({ summary: "Manually record a PENDING_APPROVAL run's APPROVE/RETURN decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: FaDepreciationRunResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideFaDepreciationRunDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaDepreciationRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.depreciationRunsService.onApprovalDecided(manager, id, dto.decision === "APPROVE", req.user?.sub ?? null),
    );
    return toView(run);
  }

  @Post(":id/post")
  @RequirePermission("fixed-assets:depreciation:post")
  @ApiOperation({ summary: "Post an APPROVED run (realizes P-30, per-category aggregated)" })
  @ApiResponse({ status: 200, type: FaDepreciationRunResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaDepreciationRunResponseDto> {
    const postedBy = requireUserId(req, "post");
    const run = await runInTransaction(this.dataSource, (manager) => this.depreciationRunsService.post(manager, id, postedBy));
    return toView(run);
  }
}
