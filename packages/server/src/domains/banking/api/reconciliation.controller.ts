import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { ReconciliationService } from "../application/reconciliation.service";
import { BankReconciliationEntity, BankReconciliationStatus } from "../domain/bank-reconciliation.entity";
import { BankReconMatchEntity } from "../domain/bank-recon-match.entity";
import {
  AutoMatchResultDto,
  BankReconMatchResponseDto,
  BankReconciliationResponseDto,
  CreateAdjustmentDto,
  ManualMatchDto,
  ReopenReconciliationDto,
  StartReconciliationDto,
} from "./dto/reconciliation.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankReconciliationEntity): BankReconciliationResponseDto {
  return {
    id: entity.id,
    accountId: entity.accountId,
    periodId: entity.periodId,
    status: entity.status,
    bookBalance: entity.bookBalance.toDecimalString(),
    bankBalance: entity.bankBalance.toDecimalString(),
    outstanding: entity.outstanding,
    lockedBy: entity.lockedBy,
    lockedAt: entity.lockedAt,
  };
}

function matchToView(entity: BankReconMatchEntity): BankReconMatchResponseDto {
  return {
    id: entity.id,
    reconciliationId: entity.reconciliationId,
    statementLineId: entity.statementLineId,
    journalLineId: entity.journalLineId,
    adjustmentJournalId: entity.adjustmentJournalId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ReconciliationController.${action}: no authenticated user on request`);
  return userId;
}

/** FR-BANK-004.1 — the bank reconciliation workspace: start/auto-match/manual-match/adjust/lock/reopen. */
@ApiTags("banking-reconciliation")
@Controller("banking/reconciliations")
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "Start a reconciliation workspace for an account/period (computes the initial book/bank balances)" })
  @ApiResponse({ status: 201, type: BankReconciliationResponseDto })
  async start(@Body() dto: StartReconciliationDto, @Req() req: AuthenticatedRequest): Promise<BankReconciliationResponseDto> {
    const initiatedBy = requireUserId(req, "start");
    const reconciliation = await runInTransaction(this.dataSource, (manager) =>
      this.reconciliationService.start(manager, dto, initiatedBy),
    );
    return toView(reconciliation);
  }

  @Get()
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "List reconciliations, optionally filtered by accountId/status" })
  @ApiResponse({ status: 200, type: [BankReconciliationResponseDto] })
  async list(
    @Query("accountId") accountId?: string,
    @Query("status") status?: BankReconciliationStatus,
  ): Promise<BankReconciliationResponseDto[]> {
    return (await this.reconciliationService.list({ accountId, status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "Get a reconciliation by id" })
  @ApiResponse({ status: 200, type: BankReconciliationResponseDto })
  async findOne(@Param("id") id: string): Promise<BankReconciliationResponseDto> {
    return toView(await this.reconciliationService.findByIdOrFail(id));
  }

  @Get(":id/matches")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "List the recon_match rows created so far for this reconciliation" })
  @ApiResponse({ status: 200, type: [BankReconMatchResponseDto] })
  async listMatches(@Param("id") id: string): Promise<BankReconMatchResponseDto[]> {
    return (await this.reconciliationService.listMatches(id)).map(matchToView);
  }

  @Post(":id/auto-match")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "Run the 3 auto-match passes (exact ref -> amount+date ±3 days -> amount-only suggestions)" })
  @ApiResponse({ status: 200, type: AutoMatchResultDto })
  async autoMatch(@Param("id") id: string): Promise<AutoMatchResultDto> {
    return runInTransaction(this.dataSource, (manager) => this.reconciliationService.autoMatch(manager, id));
  }

  @Post(":id/manual-match")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "Apply one chosen statement-line/journal-line pairing (e.g. a pass-3 suggestion)" })
  @ApiResponse({ status: 201, type: BankReconMatchResponseDto })
  async manualMatch(@Param("id") id: string, @Body() dto: ManualMatchDto): Promise<BankReconMatchResponseDto> {
    const match = await runInTransaction(this.dataSource, (manager) =>
      this.reconciliationService.manualMatch(manager, id, dto.statementLineId, dto.journalLineId),
    );
    return matchToView(match);
  }

  @Post(":id/adjustments")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "One-click adjustment creation (P-33 bank charges, or its INTEREST mirror)" })
  @ApiResponse({ status: 201, type: BankReconMatchResponseDto })
  async createAdjustment(
    @Param("id") id: string,
    @Body() dto: CreateAdjustmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BankReconMatchResponseDto> {
    const postedBy = requireUserId(req, "createAdjustment");
    const match = await runInTransaction(this.dataSource, (manager) =>
      this.reconciliationService.createAdjustment(
        manager,
        id,
        dto.statementLineId,
        { kind: dto.kind, amount: Money.fromDecimalString(dto.amount) },
        postedBy,
      ),
    );
    return matchToView(match);
  }

  @Post(":id/lock")
  @RequirePermission("banking:reconciliation:manage")
  @ApiOperation({ summary: "BR-BANK-03 — recompute balances, snapshot outstanding items, and lock the reconciliation" })
  @ApiResponse({ status: 200, type: BankReconciliationResponseDto })
  async lock(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankReconciliationResponseDto> {
    const lockedBy = requireUserId(req, "lock");
    const reconciliation = await runInTransaction(this.dataSource, (manager) =>
      this.reconciliationService.lock(manager, id, lockedBy),
    );
    return toView(reconciliation);
  }

  @Post(":id/reopen")
  @RequirePermission("banking:reconciliation:reopen")
  @ApiOperation({ summary: "Reopen a LOCKED reconciliation with a required reason (a distinct, more privileged permission)" })
  @ApiResponse({ status: 200, type: BankReconciliationResponseDto })
  async reopen(
    @Param("id") id: string,
    @Body() dto: ReopenReconciliationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BankReconciliationResponseDto> {
    const actorId = requireUserId(req, "reopen");
    const reconciliation = await runInTransaction(this.dataSource, (manager) =>
      this.reconciliationService.reopen(manager, id, dto.reason, actorId),
    );
    return toView(reconciliation);
  }
}
