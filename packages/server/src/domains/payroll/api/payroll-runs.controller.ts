import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { PayrollRunsService } from "../application/payroll-runs.service";
import { PyrlRunEntity, PyrlRunStatus } from "../domain/pyrl-run.entity";
import { PyrlRunLineEntity } from "../domain/pyrl-run-line.entity";
import { PyrlRunLineComponentEntity } from "../domain/pyrl-run-line-component.entity";
import {
  CreatePyrlRunDto,
  DecidePyrlRunDto,
  PayPyrlRunDto,
  PyrlRunLineComponentResponseDto,
  PyrlRunLineResponseDto,
  PyrlRunResponseDto,
} from "./dto/payroll-run.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PyrlRunEntity): PyrlRunResponseDto {
  return {
    id: entity.id,
    periodKey: entity.periodKey,
    runKind: entity.runKind,
    supplementsRunId: entity.supplementsRunId,
    status: entity.status,
    initiatedBy: entity.initiatedBy,
    approvedBy: entity.approvedBy,
    committedAt: entity.committedAt,
    journalId: entity.journalId,
    totals: entity.totals,
    varianceReport: entity.varianceReport,
  };
}

function toLineView(entity: PyrlRunLineEntity): PyrlRunLineResponseDto {
  return {
    id: entity.id,
    runId: entity.runId,
    employeeId: entity.employeeId,
    gross: entity.gross.toDecimalString(),
    taxable: entity.taxable.toDecimalString(),
    paye: entity.paye.toDecimalString(),
    nssfEmployee: entity.nssfEmployee.toDecimalString(),
    nssfEmployer: entity.nssfEmployer.toDecimalString(),
    shif: entity.shif.toDecimalString(),
    ahlEmployee: entity.ahlEmployee.toDecimalString(),
    ahlEmployer: entity.ahlEmployer.toDecimalString(),
    loanRecovered: entity.loanRecovered.toDecimalString(),
    otherDeductions: entity.otherDeductions.toDecimalString(),
    netPay: entity.netPay.toDecimalString(),
    deferredRecovery: entity.deferredRecovery.toDecimalString(),
    payslipFileId: entity.payslipFileId,
    paidVia: entity.paidVia,
    paidAt: entity.paidAt,
  };
}

function toLineComponentView(entity: PyrlRunLineComponentEntity): PyrlRunLineComponentResponseDto {
  return { id: entity.id, runLineId: entity.runLineId, componentId: entity.componentId, amount: entity.amount.toDecimalString() };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`PayrollRunsController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `pyrl_run` (+`pyrl_run_line`/`pyrl_run_line_component`) lifecycle
 * (FR-PYRL-006.1): create -> compute -> review -> submit -> decide -> commit
 * -> pay -> file. Line/line-component READ endpoints are folded in here
 * rather than split into their own controllers, per the task brief's own
 * instruction ("fold payroll-runs line/detail read endpoints in").
 *
 * **Permission mapping judgement call**: the task brief's own code list has
 * `payroll:run:compute` and `payroll:run:submit` but no dedicated code
 * between them for `review()` (`COMPUTED` -> `REVIEW`, generating the
 * variance report) — `review()` is gated by `payroll:run:submit` here, since
 * it's the immediate, required precondition step of "getting a run ready to
 * submit for approval", not a separate standalone action a caller would
 * reasonably want to permission differently from submission itself.
 */
@ApiTags("payroll-runs")
@Controller("payroll/runs")
export class PayrollRunsController {
  constructor(
    private readonly payrollRunsService: PayrollRunsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("payroll:run:create")
  @ApiOperation({ summary: "Create a DRAFT payroll run (MAIN or SUPPLEMENTARY)" })
  @ApiResponse({ status: 201, type: PyrlRunResponseDto })
  async create(@Body() dto: CreatePyrlRunDto, @Req() req: AuthenticatedRequest): Promise<PyrlRunResponseDto> {
    const initiatedBy = requireUserId(req, "create");
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.payrollRunsService.createRun(
        manager,
        { periodKey: dto.periodKey, runKind: dto.runKind, supplementsRunId: dto.supplementsRunId ?? null },
        initiatedBy,
      ),
    );
    return toView(created);
  }

  @Post(":id/compute")
  @RequirePermission("payroll:run:compute")
  @ApiOperation({ summary: "Compute (or recompute) a DRAFT/COMPUTED run's lines — BR-PYRL-04 proration, BR-PYRL-03 protected-net floor" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async compute(@Param("id") id: string): Promise<PyrlRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) => this.payrollRunsService.compute(manager, id));
    return toView(run);
  }

  @Post(":id/review")
  @RequirePermission("payroll:run:submit")
  @ApiOperation({ summary: "Generate the variance report against the most recent prior COMMITTED MAIN run and move to REVIEW" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async review(@Param("id") id: string): Promise<PyrlRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) => this.payrollRunsService.review(manager, id));
    return toView(run);
  }

  @Post(":id/submit")
  @RequirePermission("payroll:run:submit")
  @ApiOperation({ summary: "Submit a REVIEW run for PAYROLL_RUN approval (BR-PYRL-05)" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PyrlRunResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.payrollRunsService.submitForApproval(manager, id, initiatorId),
    );
    return toView(run);
  }

  @Post(":id/decide")
  @RequirePermission("payroll:run:decide")
  @ApiOperation({ summary: "Manually record a PENDING_APPROVAL run's approve/return decision (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async decide(@Param("id") id: string, @Body() dto: DecidePyrlRunDto, @Req() req: AuthenticatedRequest): Promise<PyrlRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.payrollRunsService.onApprovalDecided(manager, id, dto.approved, req.user?.sub ?? null),
    );
    return toView(run);
  }

  @Post(":id/commit")
  @RequirePermission("payroll:run:commit")
  @ApiOperation({ summary: "Commit an APPROVED run — realizes P-27 (one aggregated PostingService.post() call), BR-PYRL-02/06" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async commit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PyrlRunResponseDto> {
    const committedBy = requireUserId(req, "commit");
    const run = await runInTransaction(this.dataSource, (manager) => this.payrollRunsService.commit(manager, id, committedBy));
    return toView(run);
  }

  @Post(":id/pay")
  @RequirePermission("payroll:run:pay")
  @ApiOperation({ summary: "Disburse a COMMITTED run's net pay — realizes P-28" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async pay(@Param("id") id: string, @Body() dto: PayPyrlRunDto, @Req() req: AuthenticatedRequest): Promise<PyrlRunResponseDto> {
    const paidBy = requireUserId(req, "pay");
    const run = await runInTransaction(this.dataSource, (manager) =>
      this.payrollRunsService.pay(manager, id, { method: dto.method }, paidBy),
    );
    return toView(run);
  }

  @Post(":id/file")
  @RequirePermission("payroll:run:file")
  @ApiOperation({ summary: "Mark a PAID run's statutory filing administratively complete (real P10/NSSF/SHIF/AHL generation is a deferred Reporting Engine concern)" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async file(@Param("id") id: string): Promise<PyrlRunResponseDto> {
    const run = await runInTransaction(this.dataSource, (manager) => this.payrollRunsService.file(manager, id));
    return toView(run);
  }

  @Get()
  @RequirePermission("payroll:run:view")
  @ApiOperation({ summary: "List payroll runs, optionally filtered by period/status" })
  @ApiResponse({ status: 200, type: [PyrlRunResponseDto] })
  async list(
    @Query("periodKey") periodKey?: string,
    @Query("status") status?: PyrlRunStatus,
  ): Promise<PyrlRunResponseDto[]> {
    return (await this.payrollRunsService.list({ periodKey, status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("payroll:run:view")
  @ApiOperation({ summary: "Get a pyrl_run by id" })
  @ApiResponse({ status: 200, type: PyrlRunResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlRunResponseDto> {
    return toView(await this.payrollRunsService.get(id));
  }

  @Get(":id/lines")
  @RequirePermission("payroll:run:view")
  @ApiOperation({ summary: "List a run's payslip lines" })
  @ApiResponse({ status: 200, type: [PyrlRunLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<PyrlRunLineResponseDto[]> {
    return (await this.payrollRunsService.listLines(id)).map(toLineView);
  }

  @Get("lines/:lineId/components")
  @RequirePermission("payroll:run:view")
  @ApiOperation({ summary: "Get a payslip line's full earning/deduction breakdown" })
  @ApiResponse({ status: 200, type: [PyrlRunLineComponentResponseDto] })
  async listLineComponents(@Param("lineId") lineId: string): Promise<PyrlRunLineComponentResponseDto[]> {
    return (await this.payrollRunsService.listLineComponents(lineId)).map(toLineComponentView);
  }
}
