import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { VouchersService } from "../application/vouchers.service";
import { ExpVoucherEntity, ExpVoucherStatus } from "../domain/exp-voucher.entity";
import { CreateVoucherDto, UpdateVoucherDto, VoucherResponseDto } from "./dto/voucher.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ExpVoucherEntity): VoucherResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    payeeType: entity.payeeType,
    payeeRef: entity.payeeRef,
    categoryId: entity.categoryId,
    costCenterId: entity.costCenterId,
    amount: entity.amount.toDecimalString(),
    method: entity.method,
    narrative: entity.narrative,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`VouchersController.${action}: no authenticated user on request`);
  return userId;
}

/** `exp_voucher` CRUD + submit -> approve/reject -> pay (FR-EXP-002.1, BR-EXP-03, P-25). */
@ApiTags("expenses-vouchers")
@Controller("expenses/vouchers")
export class VouchersController {
  constructor(
    private readonly vouchersService: VouchersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("expenses:voucher:create")
  @ApiOperation({ summary: "Create a DRAFT expense voucher" })
  @ApiResponse({ status: 201, type: VoucherResponseDto })
  async create(@Body() dto: CreateVoucherDto, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const created = await this.vouchersService.create(
      {
        payeeType: dto.payeeType,
        payeeRef: dto.payeeRef,
        categoryId: dto.categoryId,
        costCenterId: dto.costCenterId ?? null,
        amount: Money.fromDecimalString(dto.amount),
        method: dto.method,
        narrative: dto.narrative,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("expenses:voucher:create")
  @ApiOperation({ summary: "List vouchers, optionally filtered by status" })
  @ApiResponse({ status: 200, type: [VoucherResponseDto] })
  async list(@Query("status") status?: ExpVoucherStatus): Promise<VoucherResponseDto[]> {
    return (await this.vouchersService.list(status)).map(toView);
  }

  @Get(":id")
  @RequirePermission("expenses:voucher:create")
  @ApiOperation({ summary: "Get a voucher by id" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async findOne(@Param("id") id: string): Promise<VoucherResponseDto> {
    return toView(await this.vouchersService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("expenses:voucher:create")
  @ApiOperation({ summary: "Update a DRAFT voucher" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateVoucherDto, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const updated = await this.vouchersService.update(
      id,
      {
        payeeType: dto.payeeType,
        payeeRef: dto.payeeRef,
        categoryId: dto.categoryId,
        costCenterId: dto.costCenterId,
        amount: dto.amount !== undefined ? Money.fromDecimalString(dto.amount) : undefined,
        method: dto.method,
        narrative: dto.narrative,
      },
      req.user?.sub ?? null,
    );
    return toView(updated);
  }

  @Post(":id/submit")
  @RequirePermission("expenses:voucher:submit")
  @ApiOperation({ summary: "Submit a DRAFT voucher for approval (BR-EXP-03 attachment check + informational budget check)" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const voucher = await runInTransaction(this.dataSource, (manager) => this.vouchersService.submit(manager, id, initiatorId));
    return toView(voucher);
  }

  @Post(":id/approve")
  @RequirePermission("expenses:voucher:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL voucher (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const voucher = await runInTransaction(this.dataSource, (manager) =>
      this.vouchersService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(voucher);
  }

  @Post(":id/reject")
  @RequirePermission("expenses:voucher:decide")
  @ApiOperation({ summary: "Manually record a rejection for a PENDING_APPROVAL voucher (maps to CANCELLED — exp_voucher has no dedicated REJECTED status)" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const voucher = await runInTransaction(this.dataSource, (manager) =>
      this.vouchersService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(voucher);
  }

  @Post(":id/pay")
  @RequirePermission("expenses:voucher:pay")
  @ApiOperation({ summary: "Pay an APPROVED voucher (realizes P-25, allocates the real EXP_VOUCHER number)" })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  async pay(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<VoucherResponseDto> {
    const paidBy = requireUserId(req, "pay");
    const voucher = await runInTransaction(this.dataSource, (manager) => this.vouchersService.pay(manager, id, paidBy));
    return toView(voucher);
  }
}
