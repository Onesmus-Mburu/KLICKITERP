import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { OneoffsService } from "../application/oneoffs.service";
import { PyrlOneoffEntity } from "../domain/pyrl-oneoff.entity";
import { CreatePyrlOneoffDto, PyrlOneoffResponseDto, UpdatePyrlOneoffDto } from "./dto/oneoff.dto";

function toView(entity: PyrlOneoffEntity): PyrlOneoffResponseDto {
  return {
    id: entity.id,
    employeeId: entity.employeeId,
    periodKey: entity.periodKey,
    kind: entity.kind,
    componentId: entity.componentId,
    amount: entity.amount.toDecimalString(),
    reason: entity.reason,
    approvalRef: entity.approvalRef,
  };
}

/**
 * `pyrl_oneoff` CRUD (Module 15 PASS B gap-closer — see `OneoffsService`'s
 * own doc comment for why this service/controller didn't exist in PASS A
 * despite `pyrl_oneoff` being one of the foundation pass's 13 entities).
 * Gated by `payroll:oneoff:manage`, a code added in this pass beyond the
 * task brief's own literal permission-code list, same documented judgement
 * call `EmployeeComponentsController` makes for its own added code.
 */
@ApiTags("payroll-oneoffs")
@Controller("payroll/oneoffs")
export class OneoffsController {
  constructor(private readonly oneoffsService: OneoffsService) {}

  @Post()
  @RequirePermission("payroll:oneoff:manage")
  @ApiOperation({ summary: "Create a one-off earning/deduction for an employee/period (consumed by exactly one payroll run's compute())" })
  @ApiResponse({ status: 201, type: PyrlOneoffResponseDto })
  async create(@Body() dto: CreatePyrlOneoffDto): Promise<PyrlOneoffResponseDto> {
    const created = await this.oneoffsService.create(
      {
        employeeId: dto.employeeId,
        periodKey: dto.periodKey,
        kind: dto.kind,
        componentId: dto.componentId,
        amount: Money.fromDecimalString(dto.amount),
        reason: dto.reason,
      },
      null,
    );
    return toView(created);
  }

  @Patch(":id")
  @RequirePermission("payroll:oneoff:manage")
  @ApiOperation({ summary: "Update a not-yet-consumed pyrl_oneoff row" })
  @ApiResponse({ status: 200, type: PyrlOneoffResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdatePyrlOneoffDto): Promise<PyrlOneoffResponseDto> {
    const updated = await this.oneoffsService.update(
      id,
      { amount: dto.amount ? Money.fromDecimalString(dto.amount) : undefined, reason: dto.reason },
      null,
    );
    return toView(updated);
  }

  @Delete(":id")
  @RequirePermission("payroll:oneoff:manage")
  @ApiOperation({ summary: "Remove a not-yet-consumed pyrl_oneoff row" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ removed: boolean }> {
    await this.oneoffsService.delete(id);
    return { removed: true };
  }

  @Get()
  @RequirePermission("payroll:oneoff:manage")
  @ApiOperation({ summary: "List one-offs for an employee/period, or every one-off queued for a period" })
  @ApiResponse({ status: 200, type: [PyrlOneoffResponseDto] })
  async list(
    @Query("employeeId") employeeId?: string,
    @Query("periodKey") periodKey?: string,
  ): Promise<PyrlOneoffResponseDto[]> {
    if (employeeId && periodKey) {
      return (await this.oneoffsService.listByEmployeeAndPeriod(employeeId, periodKey)).map(toView);
    }
    if (periodKey) {
      return (await this.oneoffsService.listByPeriod(periodKey)).map(toView);
    }
    return [];
  }

  @Get(":id")
  @RequirePermission("payroll:oneoff:manage")
  @ApiOperation({ summary: "Get a pyrl_oneoff by id" })
  @ApiResponse({ status: 200, type: PyrlOneoffResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlOneoffResponseDto> {
    return toView(await this.oneoffsService.get(id));
  }
}
