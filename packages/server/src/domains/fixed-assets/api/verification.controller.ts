import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { PostVerificationResult, VerificationService } from "../application/verification.service";
import { FaVerificationEntity, FaVerificationStatus } from "../domain/fa-verification.entity";
import { FaVerificationLineEntity } from "../domain/fa-verification-line.entity";
import {
  CreateFaVerificationDto,
  DecideFaVerificationDto,
  FaVerificationLineResponseDto,
  FaVerificationResponseDto,
  PostFaVerificationResponseDto,
  RecordVerificationCountsDto,
} from "./dto/verification.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaVerificationEntity): FaVerificationResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    scope: entity.scope,
    snapshotAt: entity.snapshotAt,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function toLineView(entity: FaVerificationLineEntity): FaVerificationLineResponseDto {
  return {
    id: entity.id,
    verificationId: entity.verificationId,
    assetId: entity.assetId,
    found: entity.found,
    condition: entity.condition,
    notes: entity.notes,
  };
}

function toPostView(result: PostVerificationResult): PostFaVerificationResponseDto {
  return { verification: toView(result.verification), missingAssetIds: result.missingAssetIds };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`VerificationController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `fa_verification` (+lines) physical asset-verification session
 * (FR-FA-007.1), mirroring `inventory/stock-takes`' shape: create -> record
 * counts -> submit (ASSET_VERIFICATION approval) -> decide -> post (compiles
 * a missing-asset write-off-proposal report — does NOT auto-dispose).
 */
@ApiTags("fixed-assets-verification")
@Controller("fixed-assets/verifications")
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("fixed-assets:verification:create")
  @ApiOperation({ summary: "Create a verification session (the freeze point — snapshots asset scope, found=false default)" })
  @ApiResponse({ status: 201, type: FaVerificationResponseDto })
  async create(@Body() dto: CreateFaVerificationDto, @Req() req: AuthenticatedRequest): Promise<FaVerificationResponseDto> {
    const verification = await runInTransaction(this.dataSource, (manager) =>
      this.verificationService.createSession(manager, dto.scope, req.user?.sub ?? null),
    );
    return toView(verification);
  }

  @Get()
  @RequirePermission("fixed-assets:verification:create")
  @ApiOperation({ summary: "List verification sessions, optionally filtered by status" })
  @ApiResponse({ status: 200, type: [FaVerificationResponseDto] })
  async list(@Query("status") status?: FaVerificationStatus): Promise<FaVerificationResponseDto[]> {
    return (await this.verificationService.list({ status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:verification:create")
  @ApiOperation({ summary: "Get a verification session by id" })
  @ApiResponse({ status: 200, type: FaVerificationResponseDto })
  async findOne(@Param("id") id: string): Promise<FaVerificationResponseDto> {
    return toView(await this.verificationService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("fixed-assets:verification:create")
  @ApiOperation({ summary: "List a session's lines" })
  @ApiResponse({ status: 200, type: [FaVerificationLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<FaVerificationLineResponseDto[]> {
    return (await this.verificationService.listLines(id)).map(toLineView);
  }

  @Post(":id/counts")
  @RequirePermission("fixed-assets:verification:count")
  @ApiOperation({ summary: "Record found/condition/notes against this session's lines" })
  @ApiResponse({ status: 200, type: FaVerificationResponseDto })
  async recordCounts(
    @Param("id") id: string,
    @Body() dto: RecordVerificationCountsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaVerificationResponseDto> {
    const verification = await runInTransaction(this.dataSource, (manager) =>
      this.verificationService.recordCounts(manager, id, dto.counts, req.user?.sub ?? null),
    );
    return toView(verification);
  }

  @Post(":id/submit")
  @RequirePermission("fixed-assets:verification:create")
  @ApiOperation({ summary: "Submit a REVIEW session for ASSET_VERIFICATION approval" })
  @ApiResponse({ status: 200, type: FaVerificationResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaVerificationResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const verification = await runInTransaction(this.dataSource, (manager) =>
      this.verificationService.submitForApproval(manager, id, initiatorId),
    );
    return toView(verification);
  }

  @Post(":id/decide")
  @RequirePermission("fixed-assets:verification:decide")
  @ApiOperation({ summary: "Manually record a PENDING_APPROVAL session's APPROVE/RETURN decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: FaVerificationResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideFaVerificationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaVerificationResponseDto> {
    const verification = await runInTransaction(this.dataSource, (manager) =>
      this.verificationService.onApprovalDecided(manager, id, dto.decision === "APPROVE", req.user?.sub ?? null),
    );
    return toView(verification);
  }

  @Post(":id/post")
  @RequirePermission("fixed-assets:verification:post")
  @ApiOperation({ summary: "Post an APPROVED session (applies condition updates; returns the missing-asset write-off-proposal report)" })
  @ApiResponse({ status: 200, type: PostFaVerificationResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PostFaVerificationResponseDto> {
    const postedBy = requireUserId(req, "post");
    const result = await runInTransaction(this.dataSource, (manager) => this.verificationService.post(manager, id, postedBy));
    return toPostView(result);
  }
}
