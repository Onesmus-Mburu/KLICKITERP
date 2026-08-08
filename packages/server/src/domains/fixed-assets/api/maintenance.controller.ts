import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { MaintenanceService } from "../application/maintenance.service";
import { FaMaintenanceEntity } from "../domain/fa-maintenance.entity";
import { CompleteFaMaintenanceDto, FaMaintenanceResponseDto, ScheduleFaMaintenanceDto } from "./dto/maintenance.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: FaMaintenanceEntity): FaMaintenanceResponseDto {
  return {
    id: entity.id,
    assetId: entity.assetId,
    kind: entity.kind,
    scheduledOn: entity.scheduledOn,
    doneOn: entity.doneOn,
    costExpenseVoucherId: entity.costExpenseVoucherId,
    downtimeNote: entity.downtimeNote,
  };
}

/** `fa_maintenance` — planned/repair maintenance events. `schedule()` flips the asset to UNDER_MAINTENANCE; `complete()` flips it back to ACTIVE. */
@ApiTags("fixed-assets-maintenance")
@Controller("fixed-assets/maintenance")
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("fixed-assets:maintenance:manage")
  @ApiOperation({ summary: "Schedule a maintenance event (sets fa_asset.status='UNDER_MAINTENANCE')" })
  @ApiResponse({ status: 201, type: FaMaintenanceResponseDto })
  async schedule(@Body() dto: ScheduleFaMaintenanceDto, @Req() req: AuthenticatedRequest): Promise<FaMaintenanceResponseDto> {
    const maintenance = await runInTransaction(this.dataSource, (manager) =>
      this.maintenanceService.schedule(
        manager,
        { assetId: dto.assetId, kind: dto.kind, scheduledOn: dto.scheduledOn ?? null, downtimeNote: dto.downtimeNote },
        req.user?.sub ?? null,
      ),
    );
    return toView(maintenance);
  }

  @Get("asset/:assetId")
  @RequirePermission("fixed-assets:maintenance:manage")
  @ApiOperation({ summary: "List an asset's full maintenance history, newest first" })
  @ApiResponse({ status: 200, type: [FaMaintenanceResponseDto] })
  async listByAsset(@Param("assetId") assetId: string): Promise<FaMaintenanceResponseDto[]> {
    return (await this.maintenanceService.listByAsset(assetId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("fixed-assets:maintenance:manage")
  @ApiOperation({ summary: "Get a maintenance event by id" })
  @ApiResponse({ status: 200, type: FaMaintenanceResponseDto })
  async findOne(@Param("id") id: string): Promise<FaMaintenanceResponseDto> {
    return toView(await this.maintenanceService.findByIdOrFail(id));
  }

  @Post(":id/complete")
  @RequirePermission("fixed-assets:maintenance:manage")
  @ApiOperation({ summary: "Complete a maintenance event (sets fa_asset.status back to 'ACTIVE'; optionally links an already-created exp_voucher)" })
  @ApiResponse({ status: 200, type: FaMaintenanceResponseDto })
  async complete(
    @Param("id") id: string,
    @Body() dto: CompleteFaMaintenanceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FaMaintenanceResponseDto> {
    const maintenance = await runInTransaction(this.dataSource, (manager) =>
      this.maintenanceService.complete(
        manager,
        id,
        { doneOn: dto.doneOn, downtimeNote: dto.downtimeNote, costExpenseVoucherId: dto.costExpenseVoucherId },
        req.user?.sub ?? null,
      ),
    );
    return toView(maintenance);
  }
}
