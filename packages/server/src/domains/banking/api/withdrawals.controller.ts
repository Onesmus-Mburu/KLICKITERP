import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { WithdrawalsService } from "../application/withdrawals.service";
import { BankDepositWithdrawalStatus } from "../domain/bank-deposit.entity";
import { BankWithdrawalEntity } from "../domain/bank-withdrawal.entity";
import { CreateDepositOrWithdrawalDto, DepositOrWithdrawalResponseDto } from "./dto/deposit-withdrawal.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankWithdrawalEntity): DepositOrWithdrawalResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    accountId: entity.accountId,
    amount: entity.amount.toDecimalString(),
    slipRef: entity.slipRef,
    sourceSessionId: entity.sourceSessionId,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    ackBySender: entity.ackBySender,
    ackBySenderAt: entity.ackBySenderAt,
    ackByReceiver: entity.ackByReceiver,
    ackByReceiverAt: entity.ackByReceiverAt,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`WithdrawalsController.${action}: no authenticated user on request`);
  return userId;
}

/** `bank_withdrawal` create -> submit -> approve/reject -> post -> acknowledge (FR-BANK-002.1's mirror event, FR-BANK-007). */
@ApiTags("banking-withdrawals")
@Controller("banking/withdrawals")
export class WithdrawalsController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:withdrawal:create")
  @ApiOperation({ summary: "Create a DRAFT bank withdrawal (bank -> till/safe, via Undeposited Funds)" })
  @ApiResponse({ status: 201, type: DepositOrWithdrawalResponseDto })
  async create(
    @Body() dto: CreateDepositOrWithdrawalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepositOrWithdrawalResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.withdrawalsService.create(
        manager,
        {
          accountId: dto.accountId,
          amount: Money.fromDecimalString(dto.amount),
          slipRef: dto.slipRef ?? null,
          sourceSessionId: dto.sourceSessionId ?? null,
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("banking:withdrawal:create")
  @ApiOperation({ summary: "List bank withdrawals, optionally filtered by status/accountId" })
  @ApiResponse({ status: 200, type: [DepositOrWithdrawalResponseDto] })
  async list(
    @Query("status") status?: BankDepositWithdrawalStatus,
    @Query("accountId") accountId?: string,
  ): Promise<DepositOrWithdrawalResponseDto[]> {
    return (await this.withdrawalsService.list({ status, accountId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:withdrawal:create")
  @ApiOperation({ summary: "Get a bank withdrawal by id" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async findOne(@Param("id") id: string): Promise<DepositOrWithdrawalResponseDto> {
    return toView(await this.withdrawalsService.findByIdOrFail(id));
  }

  @Post(":id/submit")
  @RequirePermission("banking:withdrawal:create")
  @ApiOperation({ summary: "Submit a DRAFT withdrawal for approval (BANK_WITHDRAWALS workflow)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const withdrawal = await runInTransaction(this.dataSource, (manager) =>
      this.withdrawalsService.submitForApproval(manager, id, initiatorId),
    );
    return toView(withdrawal);
  }

  @Post(":id/approve")
  @RequirePermission("banking:withdrawal:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL withdrawal (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const withdrawal = await runInTransaction(this.dataSource, (manager) =>
      this.withdrawalsService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(withdrawal);
  }

  @Post(":id/reject")
  @RequirePermission("banking:withdrawal:decide")
  @ApiOperation({ summary: "Manually record a rejection for a PENDING_APPROVAL withdrawal (reverts to DRAFT)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const withdrawal = await runInTransaction(this.dataSource, (manager) =>
      this.withdrawalsService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(withdrawal);
  }

  @Post(":id/post")
  @RequirePermission("banking:withdrawal:post")
  @ApiOperation({ summary: "Post an APPROVED withdrawal (debits Undeposited Funds, credits the source bank account)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const postedBy = requireUserId(req, "post");
    const withdrawal = await runInTransaction(this.dataSource, (manager) =>
      this.withdrawalsService.post(manager, id, postedBy),
    );
    return toView(withdrawal);
  }

  @Post(":id/acknowledge-sender")
  @RequirePermission("banking:withdrawal:post")
  @ApiOperation({ summary: "FR-BANK-007 dual acknowledgment — the sending party acknowledges the withdrawal" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async acknowledgeSender(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const actorId = requireUserId(req, "acknowledgeSender");
    return toView(await this.withdrawalsService.acknowledgeBySender(id, actorId));
  }

  @Post(":id/acknowledge-receiver")
  @RequirePermission("banking:withdrawal:post")
  @ApiOperation({ summary: "FR-BANK-007 dual acknowledgment — the receiving party acknowledges the withdrawal" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async acknowledgeReceiver(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const actorId = requireUserId(req, "acknowledgeReceiver");
    return toView(await this.withdrawalsService.acknowledgeByReceiver(id, actorId));
  }
}
