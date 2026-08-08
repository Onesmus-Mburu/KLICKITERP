import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { DepositsService } from "../application/deposits.service";
import { BankDepositEntity, BankDepositWithdrawalStatus } from "../domain/bank-deposit.entity";
import { CreateDepositOrWithdrawalDto, DepositOrWithdrawalResponseDto } from "./dto/deposit-withdrawal.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankDepositEntity): DepositOrWithdrawalResponseDto {
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
  if (!userId) throw new Error(`DepositsController.${action}: no authenticated user on request`);
  return userId;
}

/** `bank_deposit` create -> submit -> approve/reject -> post -> acknowledge (FR-BANK-002.1, FR-BANK-007). */
@ApiTags("banking-deposits")
@Controller("banking/deposits")
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:deposit:create")
  @ApiOperation({ summary: "Create a DRAFT bank deposit (source till/safe -> bank, via Undeposited Funds)" })
  @ApiResponse({ status: 201, type: DepositOrWithdrawalResponseDto })
  async create(
    @Body() dto: CreateDepositOrWithdrawalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepositOrWithdrawalResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.depositsService.create(
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
  @RequirePermission("banking:deposit:create")
  @ApiOperation({ summary: "List bank deposits, optionally filtered by status/accountId" })
  @ApiResponse({ status: 200, type: [DepositOrWithdrawalResponseDto] })
  async list(
    @Query("status") status?: BankDepositWithdrawalStatus,
    @Query("accountId") accountId?: string,
  ): Promise<DepositOrWithdrawalResponseDto[]> {
    return (await this.depositsService.list({ status, accountId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:deposit:create")
  @ApiOperation({ summary: "Get a bank deposit by id" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async findOne(@Param("id") id: string): Promise<DepositOrWithdrawalResponseDto> {
    return toView(await this.depositsService.findByIdOrFail(id));
  }

  @Post(":id/submit")
  @RequirePermission("banking:deposit:create")
  @ApiOperation({ summary: "Submit a DRAFT deposit for approval (BANK_DEPOSITS workflow)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const deposit = await runInTransaction(this.dataSource, (manager) =>
      this.depositsService.submitForApproval(manager, id, initiatorId),
    );
    return toView(deposit);
  }

  @Post(":id/approve")
  @RequirePermission("banking:deposit:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL deposit (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const deposit = await runInTransaction(this.dataSource, (manager) =>
      this.depositsService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(deposit);
  }

  @Post(":id/reject")
  @RequirePermission("banking:deposit:decide")
  @ApiOperation({ summary: "Manually record a rejection for a PENDING_APPROVAL deposit (reverts to DRAFT)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const deposit = await runInTransaction(this.dataSource, (manager) =>
      this.depositsService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(deposit);
  }

  @Post(":id/post")
  @RequirePermission("banking:deposit:post")
  @ApiOperation({ summary: "Post an APPROVED deposit (debits the destination bank account, credits Undeposited Funds)" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const postedBy = requireUserId(req, "post");
    const deposit = await runInTransaction(this.dataSource, (manager) => this.depositsService.post(manager, id, postedBy));
    return toView(deposit);
  }

  @Post(":id/acknowledge-sender")
  @RequirePermission("banking:deposit:post")
  @ApiOperation({ summary: "FR-BANK-007 dual acknowledgment — the sending party acknowledges the deposit" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async acknowledgeSender(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const actorId = requireUserId(req, "acknowledgeSender");
    return toView(await this.depositsService.acknowledgeBySender(id, actorId));
  }

  @Post(":id/acknowledge-receiver")
  @RequirePermission("banking:deposit:post")
  @ApiOperation({ summary: "FR-BANK-007 dual acknowledgment — the receiving party acknowledges the deposit" })
  @ApiResponse({ status: 200, type: DepositOrWithdrawalResponseDto })
  async acknowledgeReceiver(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DepositOrWithdrawalResponseDto> {
    const actorId = requireUserId(req, "acknowledgeReceiver");
    return toView(await this.depositsService.acknowledgeByReceiver(id, actorId));
  }
}
