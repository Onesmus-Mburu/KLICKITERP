import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { StockTakesService } from "../application/stock-takes.service";
import { InvStockTakeEntity, InvStockTakeStatus } from "../domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";
import { CreateStockTakeDto, DecideStockTakeDto, RecordCountsDto, StockTakeLineResponseDto, StockTakeResponseDto } from "./dto/stock-take.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: InvStockTakeEntity): StockTakeResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    storeId: entity.storeId,
    scope: entity.scope,
    snapshotAt: entity.snapshotAt,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function toLineView(entity: InvStockTakeLineEntity): StockTakeLineResponseDto {
  return {
    id: entity.id,
    stockTakeId: entity.stockTakeId,
    itemId: entity.itemId,
    snapshotQty: entity.snapshotQty,
    countedQty: entity.countedQty,
    varianceQty: entity.varianceQty,
    varianceValue: entity.varianceValue ? entity.varianceValue.toDecimalString() : null,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`StockTakesController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `inv_stock_take` (+lines) physical count session (FR-INV-009.1, BR-INV-03):
 * create -> record-counts -> submit (STOCK_ADJUSTMENTS approval) -> decide ->
 * post (P-24).
 */
@ApiTags("inventory-stock-takes")
@Controller("inventory/stock-takes")
export class StockTakesController {
  constructor(
    private readonly stockTakesService: StockTakesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("inventory:stock-take:create")
  @ApiOperation({ summary: "Create a stock-take session (the BR-INV-03 freeze point — snapshots current balances)" })
  @ApiResponse({ status: 201, type: StockTakeResponseDto })
  async create(@Body() dto: CreateStockTakeDto, @Req() req: AuthenticatedRequest): Promise<StockTakeResponseDto> {
    const initiatedBy = requireUserId(req, "create");
    const stockTake = await runInTransaction(this.dataSource, (manager) =>
      this.stockTakesService.createSession(manager, { storeId: dto.storeId, scope: dto.scope }, initiatedBy),
    );
    return toView(stockTake);
  }

  @Get()
  @RequirePermission("inventory:stock-take:create")
  @ApiOperation({ summary: "List stock takes, optionally filtered by status/store" })
  @ApiResponse({ status: 200, type: [StockTakeResponseDto] })
  async list(@Query("status") status?: InvStockTakeStatus, @Query("storeId") storeId?: string): Promise<StockTakeResponseDto[]> {
    return (await this.stockTakesService.list({ status, storeId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("inventory:stock-take:create")
  @ApiOperation({ summary: "Get a stock take by id" })
  @ApiResponse({ status: 200, type: StockTakeResponseDto })
  async findOne(@Param("id") id: string): Promise<StockTakeResponseDto> {
    return toView(await this.stockTakesService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("inventory:stock-take:create")
  @ApiOperation({ summary: "List a stock take's lines (variance report)" })
  @ApiResponse({ status: 200, type: [StockTakeLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<StockTakeLineResponseDto[]> {
    return (await this.stockTakesService.listLines(id)).map(toLineView);
  }

  @Post(":id/counts")
  @RequirePermission("inventory:stock-take:count")
  @ApiOperation({ summary: "Record counted quantities against this stock take's lines" })
  @ApiResponse({ status: 200, type: StockTakeResponseDto })
  async recordCounts(@Param("id") id: string, @Body() dto: RecordCountsDto, @Req() req: AuthenticatedRequest): Promise<StockTakeResponseDto> {
    const stockTake = await runInTransaction(this.dataSource, (manager) =>
      this.stockTakesService.recordCounts(manager, id, dto.counts, req.user?.sub ?? null),
    );
    return toView(stockTake);
  }

  @Post(":id/submit")
  @RequirePermission("inventory:stock-take:submit")
  @ApiOperation({ summary: "Submit a REVIEW stock take for STOCK_ADJUSTMENTS approval" })
  @ApiResponse({ status: 200, type: StockTakeResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<StockTakeResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const stockTake = await runInTransaction(this.dataSource, (manager) => this.stockTakesService.submitForApproval(manager, id, initiatorId));
    return toView(stockTake);
  }

  @Post(":id/decide")
  @RequirePermission("inventory:stock-take:decide")
  @ApiOperation({ summary: "Manually record a PENDING_APPROVAL stock take's APPROVE/RETURN decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: StockTakeResponseDto })
  async decide(@Param("id") id: string, @Body() dto: DecideStockTakeDto, @Req() req: AuthenticatedRequest): Promise<StockTakeResponseDto> {
    return toView(await this.stockTakesService.onApprovalDecided(id, dto.decision === "APPROVE", req.user?.sub ?? null));
  }

  @Post(":id/post")
  @RequirePermission("inventory:stock-take:post")
  @ApiOperation({ summary: "Post an APPROVED stock take (realizes P-24)" })
  @ApiResponse({ status: 200, type: StockTakeResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<StockTakeResponseDto> {
    const postedBy = requireUserId(req, "post");
    const stockTake = await runInTransaction(this.dataSource, (manager) => this.stockTakesService.post(manager, id, postedBy));
    return toView(stockTake);
  }
}
