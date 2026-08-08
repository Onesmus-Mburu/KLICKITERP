import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AccountingSyncService } from "../application/accounting-sync.service";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";
import { ListSyncLogQueryDto, ListSyncLogResponseDto, PushEntityDto, SyncLogResponseDto, TestConnectionDto, TestConnectionResponseDto } from "./dto/sync.dto";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

function toView(entity: IntgSyncLogEntity): SyncLogResponseDto {
  return {
    id: entity.id,
    kind: entity.kind,
    direction: entity.direction,
    entityType: entity.entityType,
    entityId: entity.entityId,
    status: entity.status,
    providerRef: entity.providerRef,
    error: entity.error,
    at: entity.at.toISOString(),
  };
}

/** Accounting-sync (QuickBooks/Xero/Sage) push + Test Connection (FR-SET-003.1) + `intg_sync_log` read access. */
@ApiTags("integrations-sync")
@Controller("integrations/sync")
export class SyncController {
  constructor(
    private readonly accountingSyncService: AccountingSyncService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("push")
  @RequirePermission("integrations:sync:push")
  @ApiOperation({ summary: "Push one entity to the resolved accounting-sync adapter (or SyncLogOnlyAdapter fallback); always logs to intg_sync_log (log-then-classify)" })
  @ApiResponse({ status: 201, type: SyncLogResponseDto })
  async push(@Body() dto: PushEntityDto): Promise<SyncLogResponseDto> {
    const logRow = await runInTransaction(this.dataSource, (manager) => this.accountingSyncService.pushEntity(manager, dto));
    return toView(logRow);
  }

  @Post("test-connection")
  @RequirePermission("integrations:sync:test")
  @ApiOperation({ summary: "FR-SET-003.1 Test Connection — exercises the resolved adapter's real harmless call (e.g. QuickBooks company info)" })
  @ApiResponse({ status: 200, type: TestConnectionResponseDto })
  async testConnection(@Body() dto: TestConnectionDto): Promise<TestConnectionResponseDto> {
    return this.accountingSyncService.testConnection(dto.kind);
  }

  @Get("log")
  @RequirePermission("integrations:sync:view")
  @ApiOperation({ summary: "List/filter intg_sync_log rows (kind/entityType/entityId/status), paginated" })
  @ApiResponse({ status: 200, type: ListSyncLogResponseDto })
  async listLog(@Query() query: ListSyncLogQueryDto): Promise<ListSyncLogResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await this.accountingSyncService.listLog({
      kind: query.kind,
      entityType: query.entityType,
      entityId: query.entityId,
      status: query.status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      items: items.map(toView),
      meta: { total, page, pageSize, pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
    };
  }
}
