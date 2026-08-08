import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { EmployeeAssignmentsService } from "../application/employee-assignments.service";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";
import { AssignEmployeeDto, EndAssignmentDto, PyrlEmployeeAssignmentResponseDto } from "./dto/employee-assignment.dto";

function toView(entity: PyrlEmployeeAssignmentEntity): PyrlEmployeeAssignmentResponseDto {
  return {
    id: entity.id,
    employeeId: entity.employeeId,
    structureId: entity.structureId,
    basicPay: entity.basicPay.toDecimalString(),
    effectiveFrom: entity.effectiveFrom,
    effectiveTo: entity.effectiveTo,
  };
}

/** `pyrl_employee_assignment` management. `assign()` relies on the `excl_pyrl_employee_assignment_no_overlap` DB constraint (translated to `409 Conflict` by the service — see `EmployeeAssignmentsService`'s own doc comment), so `assign` runs inside its own transaction. */
@ApiTags("payroll-employee-assignments")
@Controller("payroll/employee-assignments")
export class EmployeeAssignmentsController {
  constructor(
    private readonly employeeAssignmentsService: EmployeeAssignmentsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("payroll:assignment:manage")
  @ApiOperation({ summary: "Assign an employee onto a salary structure for an effective-dated period" })
  @ApiResponse({ status: 201, type: PyrlEmployeeAssignmentResponseDto })
  async assign(@Body() dto: AssignEmployeeDto): Promise<PyrlEmployeeAssignmentResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.employeeAssignmentsService.assign(manager, {
        employeeId: dto.employeeId,
        structureId: dto.structureId,
        basicPay: Money.fromDecimalString(dto.basicPay),
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
      }),
    );
    return toView(created);
  }

  @Post("end")
  @RequirePermission("payroll:assignment:manage")
  @ApiOperation({ summary: "Close out an employee's currently open-ended assignment" })
  @ApiResponse({ status: 200, type: PyrlEmployeeAssignmentResponseDto })
  async end(@Query("employeeId") employeeId: string, @Body() dto: EndAssignmentDto): Promise<PyrlEmployeeAssignmentResponseDto> {
    const updated = await this.employeeAssignmentsService.endAssignment(employeeId, dto.effectiveTo);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:assignment:manage")
  @ApiOperation({ summary: "List an employee's assignment history" })
  @ApiResponse({ status: 200, type: [PyrlEmployeeAssignmentResponseDto] })
  async listByEmployee(@Query("employeeId") employeeId: string): Promise<PyrlEmployeeAssignmentResponseDto[]> {
    return (await this.employeeAssignmentsService.listByEmployee(employeeId)).map(toView);
  }

  @Get("active")
  @RequirePermission("payroll:assignment:manage")
  @ApiOperation({ summary: "Get the assignment active for an employee on a given date" })
  @ApiResponse({ status: 200, type: PyrlEmployeeAssignmentResponseDto, description: "null if none covers that date" })
  async getActiveFor(
    @Query("employeeId") employeeId: string,
    @Query("date") date: string,
  ): Promise<PyrlEmployeeAssignmentResponseDto | null> {
    const row = await this.employeeAssignmentsService.getActiveFor(employeeId, date);
    return row ? toView(row) : null;
  }
}
