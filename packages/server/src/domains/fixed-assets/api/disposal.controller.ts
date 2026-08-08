import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { DisposalService } from "../application/disposal.service";
import { FaDisposalEntity, FaDisposalStatus } from "../domain/fa-disposal.entity";
import { CreateFaDisposalDto, DecideFaDisposalDto, FaDisposalResponseDto } from "./dto/disposal.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaDisposalEntity): FaDisposalResponseDto {
  return {
    id: entity.id,
    assetId: entity.assetId,
    method: entity.method,
    proceeds: entity.proceeds.toDecimalString(),
    gainLoss: entity.gainLoss ? entity.gainLoss.toDecimalString() : null,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`DisposalController.${action}: no authenticated user on request`);
  return userId;
}

/** `fa_disposal` — the disposal wizard (FR-FA-005.1): create (computes gain/loss) -> submit (ASSET_DISPOSALS approval) -> decide -> post (P-31). */
@ApiTags("fixed-assets-disposal")
@Controller("fixed-assets/disposals")
export class DisposalController {
  constructor(
    private readonly disposalService: DisposalService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("fixed-assets:disposal:create")
  @ApiOperation({ summary: "Create a DRAFT disposal (gain_loss = proceeds - NBV); BR-FA-02 blocks this on an already-disposed asset" })
  @ApiResponse({ status: 201, type: FaDisposalResponseDto })
  async create(@Body() dto: CreateFaDisposalDto, @Req() req: AuthenticatedRequest): Promise<FaDisposalResponseDto> {
    const disposal = await runInTransaction(this.dataSource, (manager) =>
      this.disposalService.create(
        manager,
        {
          assetId: dto.assetId,
          method: dto.method,
          proceeds: dto.proceeds !== undefined ? Money.fromDecimalString(dto.proceeds) : undefined,
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(disposal);
  }

  @Get()
  @RequirePermission("fixed-assets:disposal:create")
  @ApiOperation({ summary: "List disposals, optionally filtered by status" })
  @ApiResponse({ status: 200, type: [FaDisposalResponseDto] })
  async list(@Query("status") status?: FaDisposalStatus): Promise<FaDisposalResponseDto[]> {
    return (await this.disposalService.list({ status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:disposal:create")
  @ApiOperation({ summary: "Get a disposal by id" })
  @ApiResponse({ status: 200, type: FaDisposalResponseDto })
  async findOne(@Param("id") id: string): Promise<FaDisposalResponseDto> {
    return toView(await this.disposalService.findByIdOrFail(id));
  }

  @Post(":id/submit")
  @RequirePermission("fixed-assets:disposal:create")
  @ApiOperation({ summary: "Submit a DRAFT disposal for ASSET_DISPOSALS approval" })
  @ApiResponse({ status: 200, type: FaDisposalResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaDisposalResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const disposal = await runInTransaction(this.dataSource, (manager) =>
      this.disposalService.submitForApproval(manager, id, initiatorId),
    );
    return toView(disposal);
  }

  @Post(":id/decide")
  @RequirePermission("fixed-assets:disposal:decide")
  @ApiOperation({ summary: "Manually record a PENDING_APPROVAL disposal's APPROVE/RETURN decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: FaDisposalResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideFaDisposalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaDisposalResponseDto> {
    const disposal = await runInTransaction(this.dataSource, (manager) =>
      this.disposalService.onApprovalDecided(manager, id, dto.decision === "APPROVE", req.user?.sub ?? null),
    );
    return toView(disposal);
  }

  @Post(":id/post")
  @RequirePermission("fixed-assets:disposal:post")
  @ApiOperation({ summary: "Post an APPROVED disposal (realizes P-31; sets fa_asset.status='DISPOSED')" })
  @ApiResponse({ status: 200, type: FaDisposalResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaDisposalResponseDto> {
    const postedBy = requireUserId(req, "post");
    const disposal = await runInTransaction(this.dataSource, (manager) => this.disposalService.post(manager, id, postedBy));
    return toView(disposal);
  }
}
