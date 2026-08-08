import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { StockMovementsService } from "../application/stock-movements.service";
import { InvMovementEntity } from "../domain/inv-movement.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { IssueStockDto, MovementResponseDto, StockBalanceResponseDto } from "./dto/stock-movement.dto";
import { AuthenticatedRequest } from "./request-context";

const DEFAULT_MANUAL_ISSUE_REF_DOC_TYPE = "MANUAL_ISSUE";

function toBalanceView(entity: InvStockBalanceEntity): StockBalanceResponseDto {
  return { itemId: entity.itemId, storeId: entity.storeId, qty: entity.qty, value: entity.value.toDecimalString() };
}

function toMovementView(entity: InvMovementEntity): MovementResponseDto {
  return {
    id: entity.id,
    itemId: entity.itemId,
    storeId: entity.storeId,
    movementType: entity.movementType,
    qty: entity.qty,
    unitCost: entity.unitCost,
    value: entity.value.toDecimalString(),
    refDocType: entity.refDocType,
    refDocId: entity.refDocId,
    departmentId: entity.departmentId,
    journalId: entity.journalId,
    at: entity.at,
  };
}

/**
 * Read-only `inv_stock_balance`/`inv_movement` views, plus a direct manual
 * ISSUE endpoint for department consumption (FR-INV-003.1) — gated behind
 * `inventory:movement:issue`, a permission DISTINCT from
 * `inventory:stock-take:post` (the stock-take adjustment path), per the task
 * brief's explicit instruction to separate the two.
 */
@ApiTags("inventory-stock-movements")
@Controller("inventory/stock-movements")
export class StockMovementsController {
  constructor(
    private readonly stockMovementsService: StockMovementsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get("balance")
  @RequirePermission("inventory:movement:view")
  @ApiOperation({ summary: "Get the stock balance for one (item, store) pair" })
  @ApiResponse({ status: 200, type: StockBalanceResponseDto })
  async getBalance(@Query("itemId") itemId: string, @Query("storeId") storeId: string): Promise<StockBalanceResponseDto | null> {
    const balance = await this.stockMovementsService.getBalance(itemId, storeId);
    return balance ? toBalanceView(balance) : null;
  }

  @Get("balances")
  @RequirePermission("inventory:movement:view")
  @ApiOperation({ summary: "List every stock balance row at a store" })
  @ApiResponse({ status: 200, type: [StockBalanceResponseDto] })
  async listBalances(@Query("storeId") storeId: string): Promise<StockBalanceResponseDto[]> {
    return (await this.stockMovementsService.listBalancesByStore(storeId)).map(toBalanceView);
  }

  @Get("history")
  @RequirePermission("inventory:movement:view")
  @ApiOperation({ summary: "Movement history for one (item, store) pair, most recent first" })
  @ApiResponse({ status: 200, type: [MovementResponseDto] })
  async listHistory(@Query("itemId") itemId: string, @Query("storeId") storeId: string): Promise<MovementResponseDto[]> {
    return (await this.stockMovementsService.listMovements(itemId, storeId)).map(toMovementView);
  }

  @Post("issue")
  @RequirePermission("inventory:movement:issue")
  @ApiOperation({ summary: "Manually issue stock to a department (BR-INV-01/03 enforced)" })
  @ApiResponse({ status: 201, type: MovementResponseDto })
  async issue(@Body() dto: IssueStockDto, @Req() req: AuthenticatedRequest): Promise<MovementResponseDto> {
    // Authenticated (RequirePermission's guard already enforces this); no
    // actor field exists on StockMovementsService's own signatures (see its
    // class doc comment — movement rows trace back to their causing document
    // via refDocType/refDocId, not a direct actor column), so req.user is
    // only referenced here to satisfy the controller's own auth pipeline.
    void req.user;
    const movement = await runInTransaction(this.dataSource, (manager) =>
      this.stockMovementsService.recordIssue(manager, {
        itemId: dto.itemId,
        storeId: dto.storeId,
        qty: dto.qty,
        departmentId: dto.departmentId ?? null,
        refDocType: dto.refDocType ?? DEFAULT_MANUAL_ISSUE_REF_DOC_TYPE,
        refDocId: dto.refDocId ?? generateUuidV7(),
      }),
    );
    return toMovementView(movement);
  }
}
