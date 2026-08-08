import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { EmployeesService } from "../application/employees.service";
import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";
import { CreatePyrlEmployeeDto, ExitPyrlEmployeeDto, PyrlEmployeeResponseDto, UpdatePyrlEmployeeDto } from "./dto/employee.dto";

function toView(entity: PyrlEmployeeEntity): PyrlEmployeeResponseDto {
  return {
    id: entity.id,
    staffNo: entity.staffNo,
    userId: entity.userId,
    fullName: entity.fullName,
    nationalId: entity.nationalId,
    kraPin: entity.kraPin,
    nssfNo: entity.nssfNo,
    shifNo: entity.shifNo,
    employmentType: entity.employmentType,
    departmentId: entity.departmentId,
    jobTitle: entity.jobTitle,
    hireDate: entity.hireDate,
    exitDate: entity.exitDate,
    payDetails: entity.payDetails,
    bankName: entity.bankName,
    branch: entity.branch,
    account: entity.account,
    costCenterId: entity.costCenterId,
    isActive: entity.isActive,
  };
}

/**
 * `pyrl_employee` CRUD. **Access-control split (FR-PYRL-012.1)**: every
 * endpoint here except one is gated by `payroll:employee:view` (redacted
 * `pay_details`/`bank_name`/`branch`/`account` — `"***"` or `null`, never
 * real ciphertext/plaintext, per `EmployeesService`'s own doc comment) OR
 * `payroll:employee:manage` (mutations). The ONE exception is
 * `GET /payroll/employees/:id/decrypted`, gated behind
 * `payroll:employee:manage` SPECIFICALLY (not `:view`) — this is the
 * concrete implementation of PASS A's documented judgement call: ordinary
 * viewers get the redacted variant, only someone with the write-capable
 * `:manage` permission (payroll administrators) can ever see real bank/pay
 * plaintext.
 */
@ApiTags("payroll-employees")
@Controller("payroll/employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermission("payroll:employee:manage")
  @ApiOperation({ summary: "Create a pyrl_employee (redacted response)" })
  @ApiResponse({ status: 201, type: PyrlEmployeeResponseDto })
  async create(@Body() dto: CreatePyrlEmployeeDto): Promise<PyrlEmployeeResponseDto> {
    const created = await this.employeesService.create(
      {
        staffNo: dto.staffNo,
        userId: dto.userId ?? null,
        fullName: dto.fullName,
        nationalId: dto.nationalId,
        kraPin: dto.kraPin,
        nssfNo: dto.nssfNo ?? null,
        shifNo: dto.shifNo ?? null,
        employmentType: dto.employmentType,
        departmentId: dto.departmentId,
        jobTitle: dto.jobTitle,
        hireDate: dto.hireDate,
        costCenterId: dto.costCenterId,
        payDetails: dto.payDetails,
        bankName: dto.bankName,
        branch: dto.branch,
        account: dto.account,
      },
      null,
    );
    return toView(created);
  }

  @Patch(":id")
  @RequirePermission("payroll:employee:manage")
  @ApiOperation({ summary: "Update a pyrl_employee (redacted response)" })
  @ApiResponse({ status: 200, type: PyrlEmployeeResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdatePyrlEmployeeDto): Promise<PyrlEmployeeResponseDto> {
    const updated = await this.employeesService.update(id, dto, null);
    return toView(updated);
  }

  @Post(":id/exit")
  @RequirePermission("payroll:employee:manage")
  @ApiOperation({ summary: "BR-PYRL-04 — mark an employee exited (is_active=false, exit_date set)" })
  @ApiResponse({ status: 200, type: PyrlEmployeeResponseDto })
  async exit(@Param("id") id: string, @Body() dto: ExitPyrlEmployeeDto): Promise<PyrlEmployeeResponseDto> {
    const updated = await this.employeesService.exit(id, dto.exitDate);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:employee:view")
  @ApiOperation({ summary: "List payroll employees (redacted)" })
  @ApiResponse({ status: 200, type: [PyrlEmployeeResponseDto] })
  async list(
    @Query("isActive") isActive?: string,
    @Query("departmentId") departmentId?: string,
  ): Promise<PyrlEmployeeResponseDto[]> {
    const rows = await this.employeesService.list({
      isActive: isActive === undefined ? undefined : isActive === "true",
      departmentId,
    });
    return rows.map(toView);
  }

  @Get("search")
  @RequirePermission("payroll:employee:view")
  @ApiOperation({ summary: "Trigram name search (redacted)" })
  @ApiResponse({ status: 200, type: [PyrlEmployeeResponseDto] })
  async search(@Query("q") q: string): Promise<PyrlEmployeeResponseDto[]> {
    const rows = await this.employeesService.search(q);
    return rows.map(toView);
  }

  @Get(":id")
  @RequirePermission("payroll:employee:view")
  @ApiOperation({ summary: "Get a pyrl_employee by id (redacted)" })
  @ApiResponse({ status: 200, type: PyrlEmployeeResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlEmployeeResponseDto> {
    return toView(await this.employeesService.get(id));
  }

  @Get(":id/decrypted")
  @RequirePermission("payroll:employee:manage")
  @ApiOperation({ summary: "Get a pyrl_employee by id with REAL plaintext pay_details/bank_name/branch/account — gated behind payroll:employee:manage, not :view (FR-PYRL-012.1)" })
  @ApiResponse({ status: 200, type: PyrlEmployeeResponseDto })
  async findOneDecrypted(@Param("id") id: string): Promise<PyrlEmployeeResponseDto> {
    return toView(await this.employeesService.getDecrypted(id));
  }
}
