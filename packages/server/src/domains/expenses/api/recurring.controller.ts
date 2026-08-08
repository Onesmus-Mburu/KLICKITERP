import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { RecurringService } from "../application/recurring.service";
import { ExpRecurringEntity } from "../domain/exp-recurring.entity";
import { CreateRecurringDto, RecurringResponseDto, RunDueDto, RunDueResultDto, UpdateRecurringDto } from "./dto/recurring.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ExpRecurringEntity): RecurringResponseDto {
  return {
    id: entity.id,
    template: entity.template,
    scheduleCron: entity.scheduleCron,
    nextRunOn: entity.nextRunOn,
    lastVoucherId: entity.lastVoucherId,
    isActive: entity.isActive,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`RecurringController.${action}: no authenticated user on request`);
  return userId;
}

/** `exp_recurring` CRUD + manual "run due templates now" (no scheduler/worker exists anywhere in this codebase — see RecurringService's doc comment). */
@ApiTags("expenses-recurring")
@Controller("expenses/recurring")
export class RecurringController {
  constructor(
    private readonly recurringService: RecurringService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("expenses:recurring:manage")
  @ApiOperation({ summary: "Create a recurring expense voucher template" })
  @ApiResponse({ status: 201, type: RecurringResponseDto })
  async create(@Body() dto: CreateRecurringDto, @Req() req: AuthenticatedRequest): Promise<RecurringResponseDto> {
    const created = await this.recurringService.create(
      { template: dto.template, scheduleCron: dto.scheduleCron, nextRunOn: dto.nextRunOn },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("expenses:recurring:manage")
  @ApiOperation({ summary: "List recurring templates" })
  @ApiResponse({ status: 200, type: [RecurringResponseDto] })
  async list(): Promise<RecurringResponseDto[]> {
    return (await this.recurringService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("expenses:recurring:manage")
  @ApiOperation({ summary: "Get a recurring template by id" })
  @ApiResponse({ status: 200, type: RecurringResponseDto })
  async findOne(@Param("id") id: string): Promise<RecurringResponseDto> {
    return toView(await this.recurringService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("expenses:recurring:manage")
  @ApiOperation({ summary: "Update a recurring template" })
  @ApiResponse({ status: 200, type: RecurringResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateRecurringDto, @Req() req: AuthenticatedRequest): Promise<RecurringResponseDto> {
    const updated = await this.recurringService.update(
      id,
      { template: dto.template, scheduleCron: dto.scheduleCron, nextRunOn: dto.nextRunOn, isActive: dto.isActive },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }

  @Post("run-due")
  @RequirePermission("expenses:recurring:run")
  @ApiOperation({ summary: "MANUAL trigger — materializes a DRAFT exp_voucher for every active template whose next_run_on has arrived, advances next_run_on per schedule_cron" })
  @ApiResponse({ status: 200, type: [RunDueResultDto] })
  async runDue(@Body() dto: RunDueDto, @Req() req: AuthenticatedRequest): Promise<RunDueResultDto[]> {
    const actorId = requireUserId(req, "runDue");
    const asOfDate = dto.asOfDate ?? new Date().toISOString().slice(0, 10);
    return runInTransaction(this.dataSource, (manager) => this.recurringService.runDue(manager, asOfDate, actorId));
  }
}
