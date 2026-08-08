import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { BudgetsService } from "../application/budgets.service";
import { GlBudgetEntity } from "../domain/gl-budget.entity";
import { GlBudgetLineEntity } from "../domain/gl-budget-line.entity";
import { Money } from "../../shared/money/money";
import { BudgetLineInputDto } from "./dto/budget-line-input.dto";
import { BudgetLineResponseDto, BudgetResponseDto } from "./dto/budget-response.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetLineDto } from "./dto/update-budget-line.dto";
import { AuthenticatedRequest } from "./request-context";

function toBudgetView(entity: GlBudgetEntity): BudgetResponseDto {
  return entity;
}

function toBudgetLineView(entity: GlBudgetLineEntity): BudgetLineResponseDto {
  return { ...entity, annualAmount: entity.annualAmount.toDecimalString() } as unknown as BudgetLineResponseDto;
}

/**
 * `gl_budget` + `gl_budget_line` CRUD, `submit` for approval, and a manual
 * `activate`/`reject` action standing in for `BudgetsService.onApprovalDecided()`
 * until a real event-driven dispatcher exists off `ApprovalEngineService.decide()`
 * — see `BudgetsService`'s doc comment. This is an interim, deliberately
 * manual trigger: a caller (a System Admin, or whoever manually observed
 * the approval instance's outcome via `GET /approvals/workflow-versions`/
 * the approvals inbox) calls one of these two endpoints themselves.
 */
@ApiTags("accounting-budgets")
@Controller("accounting/budgets")
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "Create a DRAFT gl_budget with its lines" })
  @ApiResponse({ status: 201, type: BudgetResponseDto })
  async create(@Body() dto: CreateBudgetDto, @Req() req: AuthenticatedRequest): Promise<BudgetResponseDto> {
    const created = await this.budgetsService.create(
      {
        fiscalYearId: dto.fiscalYearId,
        name: dto.name,
        versionLabel: dto.versionLabel,
        lines: dto.lines.map(toLineInput),
      },
      req.user?.sub ?? null,
    );
    return toBudgetView(created);
  }

  @Get()
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "List budgets for a fiscal year" })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  async list(@Query("fiscalYearId") fiscalYearId: string): Promise<BudgetResponseDto[]> {
    return (await this.budgetsService.listByFiscalYear(fiscalYearId)).map(toBudgetView);
  }

  @Get(":id")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "Get a budget by id" })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async findOne(@Param("id") id: string): Promise<BudgetResponseDto> {
    return toBudgetView(await this.budgetsService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "List a budget's lines" })
  @ApiResponse({ status: 200, type: [BudgetLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<BudgetLineResponseDto[]> {
    return (await this.budgetsService.listLines(id)).map(toBudgetLineView);
  }

  @Post(":id/lines")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "Add a line to a DRAFT budget" })
  @ApiResponse({ status: 201, type: BudgetLineResponseDto })
  async addLine(
    @Param("id") id: string,
    @Body() dto: BudgetLineInputDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BudgetLineResponseDto> {
    return toBudgetLineView(await this.budgetsService.addLine(id, toLineInput(dto), req.user?.sub ?? null));
  }

  @Patch("lines/:lineId")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "Update a line on a DRAFT budget" })
  @ApiResponse({ status: 200, type: BudgetLineResponseDto })
  async updateLine(
    @Param("lineId") lineId: string,
    @Body() dto: UpdateBudgetLineDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BudgetLineResponseDto> {
    const updated = await this.budgetsService.updateLine(
      lineId,
      {
        periodPhasing: dto.periodPhasing,
        annualAmount: dto.annualAmount !== undefined ? Money.fromDecimalString(dto.annualAmount) : undefined,
      },
      req.user?.sub ?? null,
    );
    return toBudgetLineView(updated);
  }

  @Delete("lines/:lineId")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({ summary: "Remove a line from a DRAFT budget" })
  @ApiResponse({ status: 200 })
  async removeLine(@Param("lineId") lineId: string): Promise<{ deleted: boolean }> {
    await this.budgetsService.removeLine(lineId);
    return { deleted: true };
  }

  @Post(":id/submit")
  @RequirePermission("accounting:budget:submit")
  @ApiOperation({ summary: "Submit a DRAFT budget for approval (sums annual_amount across lines)" })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BudgetResponseDto> {
    const initiatorId = req.user?.sub ?? null;
    if (!initiatorId) {
      throw new Error("BudgetsController.submit: no authenticated user on request");
    }
    return toBudgetView(await this.budgetsService.submitForApproval(id, initiatorId));
  }

  @Post(":id/activate")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({
    summary: "Manually activate a PENDING_APPROVAL budget (interim stand-in for an automatic approval-decision dispatcher — see class doc comment)",
  })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BudgetResponseDto> {
    return toBudgetView(await this.budgetsService.onApprovalDecided(id, true, req.user?.sub ?? null));
  }

  @Post(":id/reject")
  @RequirePermission("accounting:budget:manage")
  @ApiOperation({
    summary: "Manually reject a PENDING_APPROVAL budget back to DRAFT (interim stand-in — see class doc comment)",
  })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BudgetResponseDto> {
    return toBudgetView(await this.budgetsService.onApprovalDecided(id, false, req.user?.sub ?? null));
  }
}

function toLineInput(dto: BudgetLineInputDto): {
  accountId: string;
  costCenterId: string | null;
  periodPhasing: Record<string, unknown>;
  annualAmount: Money;
} {
  return {
    accountId: dto.accountId,
    costCenterId: dto.costCenterId ?? null,
    periodPhasing: dto.periodPhasing,
    annualAmount: Money.fromDecimalString(dto.annualAmount),
  };
}
