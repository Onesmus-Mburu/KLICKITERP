import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { TransfersService } from "../application/transfers.service";
import { FaTransferEntity } from "../domain/fa-transfer.entity";
import { CreateFaTransferDto, FaTransferResponseDto } from "./dto/transfer.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaTransferEntity): FaTransferResponseDto {
  return {
    id: entity.id,
    assetId: entity.assetId,
    fromLocation: entity.fromLocation,
    fromCustodianUserId: entity.fromCustodianUserId,
    toLocation: entity.toLocation,
    toCustodianUserId: entity.toCustodianUserId,
    ackBy: entity.ackBy,
    at: entity.at,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`TransfersController.${action}: no authenticated user on request`);
  return userId;
}

/** `fa_transfer` — an asset's location/custodian handover event, plus lightweight receipt acknowledgment (no approval chain per the DDL). */
@ApiTags("fixed-assets-transfers")
@Controller("fixed-assets/transfers")
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("fixed-assets:transfer:create")
  @ApiOperation({ summary: "Transfer an asset to a new location/custodian (BR-FA-02 blocks this on a disposed asset)" })
  @ApiResponse({ status: 201, type: FaTransferResponseDto })
  async create(@Body() dto: CreateFaTransferDto, @Req() req: AuthenticatedRequest): Promise<FaTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.create(
        manager,
        { assetId: dto.assetId, toLocation: dto.toLocation, toCustodianUserId: dto.toCustodianUserId ?? null },
        req.user?.sub ?? null,
      ),
    );
    return toView(transfer);
  }

  @Get("asset/:assetId")
  @RequirePermission("fixed-assets:transfer:create")
  @ApiOperation({ summary: "List an asset's full transfer history, newest first" })
  @ApiResponse({ status: 200, type: [FaTransferResponseDto] })
  async listByAsset(@Param("assetId") assetId: string): Promise<FaTransferResponseDto[]> {
    return (await this.transfersService.listByAsset(assetId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:transfer:create")
  @ApiOperation({ summary: "Get a transfer by id" })
  @ApiResponse({ status: 200, type: FaTransferResponseDto })
  async findOne(@Param("id") id: string): Promise<FaTransferResponseDto> {
    return toView(await this.transfersService.findByIdOrFail(id));
  }

  @Post(":id/acknowledge")
  @RequirePermission("fixed-assets:transfer:create")
  @ApiOperation({ summary: "The receiving custodian/location confirms receipt of a transfer" })
  @ApiResponse({ status: 200, type: FaTransferResponseDto })
  async acknowledge(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<FaTransferResponseDto> {
    const ackBy = requireUserId(req, "acknowledge");
    const transfer = await runInTransaction(this.dataSource, (manager) => this.transfersService.acknowledge(manager, id, ackBy));
    return toView(transfer);
  }
}
