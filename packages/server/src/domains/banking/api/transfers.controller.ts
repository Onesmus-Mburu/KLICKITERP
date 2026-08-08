import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { BankTransfersService } from "../application/bank-transfers.service";
import { BankTransferEntity, BankTransferStatus } from "../domain/bank-transfer.entity";
import { BankTransferResponseDto, CreateBankTransferDto } from "./dto/transfer.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankTransferEntity): BankTransferResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    fromAccountId: entity.fromAccountId,
    toAccountId: entity.toAccountId,
    amount: entity.amount.toDecimalString(),
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`TransfersController.${action}: no authenticated user on request`);
  return userId;
}

/** `bank_transfer` create -> submit -> approve/reject -> post (BR-BANK-01, P-32). */
@ApiTags("banking-transfers")
@Controller("banking/transfers")
export class TransfersController {
  constructor(
    private readonly transfersService: BankTransfersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:transfer:create")
  @ApiOperation({ summary: "Create a DRAFT bank transfer between two bank accounts" })
  @ApiResponse({ status: 201, type: BankTransferResponseDto })
  async create(@Body() dto: CreateBankTransferDto, @Req() req: AuthenticatedRequest): Promise<BankTransferResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.create(
        manager,
        {
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          amount: Money.fromDecimalString(dto.amount),
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("banking:transfer:create")
  @ApiOperation({ summary: "List bank transfers, optionally filtered by status/accountId" })
  @ApiResponse({ status: 200, type: [BankTransferResponseDto] })
  async list(
    @Query("status") status?: BankTransferStatus,
    @Query("accountId") accountId?: string,
  ): Promise<BankTransferResponseDto[]> {
    return (await this.transfersService.list({ status, accountId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:transfer:create")
  @ApiOperation({ summary: "Get a bank transfer by id" })
  @ApiResponse({ status: 200, type: BankTransferResponseDto })
  async findOne(@Param("id") id: string): Promise<BankTransferResponseDto> {
    return toView(await this.transfersService.findByIdOrFail(id));
  }

  @Post(":id/submit")
  @RequirePermission("banking:transfer:create")
  @ApiOperation({ summary: "Submit a DRAFT transfer for approval (BANK_TRANSFERS workflow)" })
  @ApiResponse({ status: 200, type: BankTransferResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankTransferResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.submitForApproval(manager, id, initiatorId),
    );
    return toView(transfer);
  }

  @Post(":id/approve")
  @RequirePermission("banking:transfer:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL transfer (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: BankTransferResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(transfer);
  }

  @Post(":id/reject")
  @RequirePermission("banking:transfer:decide")
  @ApiOperation({ summary: "Manually record a rejection for a PENDING_APPROVAL transfer (reverts to DRAFT)" })
  @ApiResponse({ status: 200, type: BankTransferResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(transfer);
  }

  @Post(":id/post")
  @RequirePermission("banking:transfer:post")
  @ApiOperation({ summary: "Post an APPROVED transfer (realizes P-32's 2-leg TRANSFER_CLEARING journal)" })
  @ApiResponse({ status: 200, type: BankTransferResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankTransferResponseDto> {
    const postedBy = requireUserId(req, "post");
    const transfer = await runInTransaction(this.dataSource, (manager) => this.transfersService.post(manager, id, postedBy));
    return toView(transfer);
  }
}
