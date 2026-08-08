import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { EmployeeComponentsService } from "../application/employee-components.service";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";
import { AddEmployeeComponentDto, EndEmployeeComponentDto, PyrlEmployeeComponentResponseDto } from "./dto/employee-component.dto";

function toView(entity: PyrlEmployeeComponentEntity): PyrlEmployeeComponentResponseDto {
  return {
    id: entity.id,
    employeeId: entity.employeeId,
    componentId: entity.componentId,
    amount: entity.amount.toDecimalString(),
    effectiveFrom: entity.effectiveFrom,
    effectiveTo: entity.effectiveTo,
  };
}

/**
 * `pyrl_employee_component` management — an employee-specific personal
 * allowance/deduction override, effective-dated. Gated by
 * `payroll:employee-component:manage`, a code added in this pass beyond the
 * task brief's own literal permission-code list (which named
 * `payroll:assignment:manage` for `pyrl_employee_assignment` but no
 * corresponding code for this sibling entity) — necessary since every
 * mutating endpoint in this codebase must be `@RequirePermission`-guarded
 * and no existing code semantically fits an employee-specific component
 * override, a documented judgement call.
 */
@ApiTags("payroll-employee-components")
@Controller("payroll/employee-components")
export class EmployeeComponentsController {
  constructor(
    private readonly employeeComponentsService: EmployeeComponentsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("payroll:employee-component:manage")
  @ApiOperation({ summary: "Add an employee-specific component override" })
  @ApiResponse({ status: 201, type: PyrlEmployeeComponentResponseDto })
  async add(@Body() dto: AddEmployeeComponentDto): Promise<PyrlEmployeeComponentResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.employeeComponentsService.add(manager, {
        employeeId: dto.employeeId,
        componentId: dto.componentId,
        amount: Money.fromDecimalString(dto.amount),
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
      }),
    );
    return toView(created);
  }

  @Post("end")
  @RequirePermission("payroll:employee-component:manage")
  @ApiOperation({ summary: "Close out an employee's open-ended override for a specific component" })
  @ApiResponse({ status: 200, type: PyrlEmployeeComponentResponseDto })
  async end(
    @Query("employeeId") employeeId: string,
    @Body() dto: EndEmployeeComponentDto,
  ): Promise<PyrlEmployeeComponentResponseDto> {
    const updated = await this.employeeComponentsService.endOverride(employeeId, dto.componentId, dto.effectiveTo);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:employee-component:manage")
  @ApiOperation({ summary: "List an employee's component-override history" })
  @ApiResponse({ status: 200, type: [PyrlEmployeeComponentResponseDto] })
  async listByEmployee(@Query("employeeId") employeeId: string): Promise<PyrlEmployeeComponentResponseDto[]> {
    return (await this.employeeComponentsService.listByEmployee(employeeId)).map(toView);
  }

  @Get("active")
  @RequirePermission("payroll:employee-component:manage")
  @ApiOperation({ summary: "List an employee's component overrides active on a given date" })
  @ApiResponse({ status: 200, type: [PyrlEmployeeComponentResponseDto] })
  async getActiveFor(
    @Query("employeeId") employeeId: string,
    @Query("date") date: string,
  ): Promise<PyrlEmployeeComponentResponseDto[]> {
    return (await this.employeeComponentsService.getActiveFor(employeeId, date)).map(toView);
  }
}
