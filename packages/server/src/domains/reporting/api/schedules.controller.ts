import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { runInTransaction } from "../../../shared/database/tx";
import { ReportSchedulesService, RunDueResult } from "../application/report-schedules.service";
import { RptScheduleEntity } from "../domain/rpt-schedule.entity";
import { CreateScheduleDto, RunDueDto, ScheduleResponseDto, UpdateScheduleDto } from "./dto/schedule.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: RptScheduleEntity): ScheduleResponseDto {
  return {
    id: entity.id,
    reportCode: entity.reportCode,
    params: entity.params,
    cron: entity.cron,
    recipients: entity.recipients,
    format: entity.format,
    ownerUserId: entity.ownerUserId,
    isActive: entity.isActive,
    lastRunAt: entity.lastRunAt ? entity.lastRunAt.toISOString() : null,
    lastOk: entity.lastOk,
  };
}

/**
 * `rpt_schedule` CRUD plus the manual `POST /reports/schedules/run-due`
 * trigger (`ReportSchedulesService.runDue()` — no real scheduler exists in
 * this codebase, see that service's own doc comment). Every route is gated
 * by the single `reports:schedule:manage` code, per the task brief's own
 * explicit permission-code list — scheduling is inherently an
 * administrative/management action, not a personal-preference one like
 * `rpt_saved_params` (which is owner-scoped instead), so there is no
 * separate `:view` split here.
 */
@ApiTags("reporting-schedules")
@Controller("reports/schedules")
@RequirePermission("reports:schedule:manage")
export class SchedulesController {
  constructor(
    private readonly schedulesService: ReportSchedulesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a recurring report schedule" })
  @ApiResponse({ status: 201, type: ScheduleResponseDto })
  async create(@Body() dto: CreateScheduleDto, @Req() req: AuthenticatedRequest): Promise<ScheduleResponseDto> {
    const ownerUserId = req.user?.sub;
    if (!ownerUserId) throw new AuthenticationException("Authentication required");
    const schedule = await this.schedulesService.create({
      reportCode: dto.reportCode,
      params: dto.params,
      cron: dto.cron,
      recipients: dto.recipients,
      format: dto.format,
      ownerUserId,
    });
    return toView(schedule);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's own schedules" })
  @ApiResponse({ status: 200, type: [ScheduleResponseDto] })
  async list(@Req() req: AuthenticatedRequest): Promise<ScheduleResponseDto[]> {
    const ownerUserId = req.user?.sub;
    if (!ownerUserId) throw new AuthenticationException("Authentication required");
    return (await this.schedulesService.listByOwner(ownerUserId)).map(toView);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a schedule by id" })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async findOne(@Param("id") id: string): Promise<ScheduleResponseDto> {
    return toView(await this.schedulesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a schedule's params/cron/recipients/format/active flag" })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateScheduleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ScheduleResponseDto> {
    const actorId = req.user?.sub;
    if (!actorId) throw new AuthenticationException("Authentication required");
    return toView(await this.schedulesService.update(id, dto, actorId));
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a schedule" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: true }> {
    await this.schedulesService.delete(id);
    return { deleted: true };
  }

  @Post("run-due")
  @ApiOperation({ summary: "Manually trigger every active schedule due as of the given date (no scheduler exists — see ReportSchedulesService)" })
  @ApiResponse({ status: 200 })
  async runDue(@Body() dto: RunDueDto): Promise<RunDueResult[]> {
    const asOfDate = dto.asOfDate ?? new Date().toISOString().slice(0, 10);
    return runInTransaction(this.dataSource, (manager) => this.schedulesService.runDue(manager, asOfDate));
  }
}
