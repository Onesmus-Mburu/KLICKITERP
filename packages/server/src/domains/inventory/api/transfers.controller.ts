import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { TransfersService } from "../application/transfers.service";
import { InvTransferEntity, InvTransferStatus } from "../domain/inv-transfer.entity";
import { InvTransferLineEntity } from "../domain/inv-transfer-line.entity";
import { IssueTransferDto, TransferLineResponseDto, TransferResponseDto } from "./dto/transfer.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: InvTransferEntity): TransferResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    fromStoreId: entity.fromStoreId,
    toStoreId: entity.toStoreId,
    status: entity.status,
    issuedBy: entity.issuedBy,
    receivedBy: entity.receivedBy,
  };
}

function toLineView(entity: InvTransferLineEntity): TransferLineResponseDto {
  return { id: entity.id, transferId: entity.transferId, lineNo: entity.lineNo, itemId: entity.itemId, qty: entity.qty, unitCost: entity.unitCost };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`TransfersController.${action}: no authenticated user on request`);
  return userId;
}

/** `inv_transfer` (+lines) two-step (issue -> receive) inter-store transfer (FR-INV-003.1). */
@ApiTags("inventory-transfers")
@Controller("inventory/transfers")
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("issue")
  @RequirePermission("inventory:transfer:issue")
  @ApiOperation({ summary: "Issue an inter-store transfer (deducts the source store immediately)" })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  async issue(@Body() dto: IssueTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferResponseDto> {
    const issuedBy = requireUserId(req, "issue");
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.issue(
        manager,
        { fromStoreId: dto.fromStoreId, toStoreId: dto.toStoreId, lines: dto.lines },
        issuedBy,
      ),
    );
    return toView(transfer);
  }

  @Post(":id/receive")
  @RequirePermission("inventory:transfer:receive")
  @ApiOperation({ summary: "Receive an issued/in-transit transfer at its destination store" })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  async receive(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<TransferResponseDto> {
    const receivedBy = requireUserId(req, "receive");
    const transfer = await runInTransaction(this.dataSource, (manager) => this.transfersService.receive(manager, id, receivedBy));
    return toView(transfer);
  }

  @Post(":id/cancel")
  @RequirePermission("inventory:transfer:issue")
  @ApiOperation({ summary: "Cancel an ISSUED/IN_TRANSIT transfer (reverses the source-side deduction)" })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  async cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<TransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) => this.transfersService.cancel(manager, id, req.user?.sub ?? null));
    return toView(transfer);
  }

  @Get()
  @RequirePermission("inventory:transfer:issue")
  @ApiOperation({ summary: "List transfers, optionally filtered by status/store" })
  @ApiResponse({ status: 200, type: [TransferResponseDto] })
  async list(
    @Query("status") status?: InvTransferStatus,
    @Query("fromStoreId") fromStoreId?: string,
    @Query("toStoreId") toStoreId?: string,
  ): Promise<TransferResponseDto[]> {
    return (await this.transfersService.list({ status, fromStoreId, toStoreId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("inventory:transfer:issue")
  @ApiOperation({ summary: "Get a transfer by id" })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  async findOne(@Param("id") id: string): Promise<TransferResponseDto> {
    return toView(await this.transfersService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("inventory:transfer:issue")
  @ApiOperation({ summary: "List a transfer's lines" })
  @ApiResponse({ status: 200, type: [TransferLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<TransferLineResponseDto[]> {
    return (await this.transfersService.listLines(id)).map(toLineView);
  }
}
