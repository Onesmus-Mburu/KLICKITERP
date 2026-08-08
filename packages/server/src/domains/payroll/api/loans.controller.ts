import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { LoansService } from "../application/loans.service";
import { PyrlLoanEntity } from "../domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";
import {
  CreatePyrlLoanDto,
  DecidePyrlLoanDto,
  PyrlLoanResponseDto,
  PyrlLoanScheduleResponseDto,
  RecordLoanRecoveryDto,
  SettleLoanEarlyDto,
} from "./dto/loan.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PyrlLoanEntity): PyrlLoanResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    employeeId: entity.employeeId,
    principal: entity.principal.toDecimalString(),
    rate: entity.rate,
    rateKind: entity.rateKind,
    termMonths: entity.termMonths,
    status: entity.status,
    approvalRef: entity.approvalRef,
    balance: entity.balance.toDecimalString(),
  };
}

function toScheduleView(entity: PyrlLoanScheduleEntity): PyrlLoanScheduleResponseDto {
  return {
    id: entity.id,
    loanId: entity.loanId,
    seq: entity.seq,
    duePeriod: entity.duePeriod,
    principalDue: entity.principalDue.toDecimalString(),
    interestDue: entity.interestDue.toDecimalString(),
    recoveredAmount: entity.recoveredAmount.toDecimalString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`LoansController.${action}: no authenticated user on request`);
  return userId;
}

/** `pyrl_loan` (+`pyrl_loan_schedule`) lifecycle (FR-PYRL-004.1). No dedicated `:view` code — every read here reuses `payroll:loan:create` (the base permission every loan-workflow participant needs), same "reuse the nearest one" precedent `PurchaseOrdersController` established. */
@ApiTags("payroll-loans")
@Controller("payroll/loans")
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("payroll:loan:create")
  @ApiOperation({ summary: "Create a staff loan application (submits PAYROLL_LOANS for approval)" })
  @ApiResponse({ status: 201, type: PyrlLoanResponseDto })
  async create(@Body() dto: CreatePyrlLoanDto, @Req() req: AuthenticatedRequest): Promise<PyrlLoanResponseDto> {
    const initiatorId = requireUserId(req, "create");
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.loansService.create(
        manager,
        {
          employeeId: dto.employeeId,
          principal: Money.fromDecimalString(dto.principal),
          rate: dto.rate,
          rateKind: dto.rateKind,
          termMonths: dto.termMonths,
        },
        initiatorId,
      ),
    );
    return toView(created);
  }

  @Post(":id/decide")
  @RequirePermission("payroll:loan:decide")
  @ApiOperation({ summary: "Record a PENDING_APPROVAL loan's approve/reject decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: PyrlLoanResponseDto })
  async decide(@Param("id") id: string, @Body() dto: DecidePyrlLoanDto): Promise<PyrlLoanResponseDto> {
    const updated = await runInTransaction(this.dataSource, (manager) =>
      this.loansService.onApprovalDecided(manager, id, dto.approved),
    );
    return toView(updated);
  }

  @Post(":id/record-recovery")
  @RequirePermission("payroll:loan:decide")
  @ApiOperation({ summary: "Manually record a recovery against a loan's schedule for a period (out-of-band correction — payroll runs call LoansService.recordRecovery() directly at commit time)" })
  @ApiResponse({ status: 200, type: PyrlLoanResponseDto })
  async recordRecovery(@Param("id") id: string, @Body() dto: RecordLoanRecoveryDto): Promise<PyrlLoanResponseDto> {
    const updated = await runInTransaction(this.dataSource, (manager) =>
      this.loansService.recordRecovery(manager, id, dto.periodKey, Money.fromDecimalString(dto.amount)),
    );
    return toView(updated);
  }

  @Post(":id/settle-early")
  @RequirePermission("payroll:loan:decide")
  @ApiOperation({ summary: "Out-of-band lump-sum early settlement — cancels remaining unrecovered future installments" })
  @ApiResponse({ status: 200, type: PyrlLoanResponseDto })
  async settleEarly(@Param("id") id: string, @Body() dto: SettleLoanEarlyDto): Promise<PyrlLoanResponseDto> {
    const updated = await runInTransaction(this.dataSource, (manager) =>
      this.loansService.settleEarly(manager, id, dto.settlementDate),
    );
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:loan:create")
  @ApiOperation({ summary: "List an employee's loans" })
  @ApiResponse({ status: 200, type: [PyrlLoanResponseDto] })
  async listByEmployee(@Query("employeeId") employeeId: string): Promise<PyrlLoanResponseDto[]> {
    return (await this.loansService.listByEmployee(employeeId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("payroll:loan:create")
  @ApiOperation({ summary: "Get a pyrl_loan by id" })
  @ApiResponse({ status: 200, type: PyrlLoanResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlLoanResponseDto> {
    return toView(await this.loansService.get(id));
  }

  @Get(":id/schedule")
  @RequirePermission("payroll:loan:create")
  @ApiOperation({ summary: "Get a loan's full amortization schedule" })
  @ApiResponse({ status: 200, type: [PyrlLoanScheduleResponseDto] })
  async schedule(@Param("id") id: string): Promise<PyrlLoanScheduleResponseDto[]> {
    return (await this.loansService.schedule(id)).map(toScheduleView);
  }
}
