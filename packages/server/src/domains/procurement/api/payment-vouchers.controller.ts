import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { PaymentVouchersService } from "../application/payment-vouchers.service";
import { ProcPaymentVoucherEntity, ProcPaymentVoucherStatus } from "../domain/proc-payment-voucher.entity";
import { ProcVoucherAllocationEntity } from "../domain/proc-voucher-allocation.entity";
import { CreatePaymentVoucherDto, PaymentVoucherAllocationResponseDto, PaymentVoucherResponseDto } from "./dto/payment-voucher.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcPaymentVoucherEntity): PaymentVoucherResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    supplierId: entity.supplierId,
    method: entity.method,
    bankAccountId: entity.bankAccountId,
    chequeLeafId: entity.chequeLeafId,
    total: entity.total.toDecimalString(),
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    remittanceSent: entity.remittanceSent,
  };
}

function toAllocationView(entity: ProcVoucherAllocationEntity): PaymentVoucherAllocationResponseDto {
  return {
    id: entity.id,
    voucherId: entity.voucherId,
    supplierInvoiceId: entity.supplierInvoiceId,
    amount: entity.amount.toDecimalString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`PaymentVouchersController.${action}: no authenticated user on request`);
  return userId;
}

/** `proc_payment_voucher` (+allocations): create -> submit -> approve/reject -> execute (FR-PROC-008.1, BR-PROC-04, P-21). */
@ApiTags("procurement-payment-vouchers")
@Controller("procurement/payment-vouchers")
export class PaymentVouchersController {
  constructor(
    private readonly paymentVouchersService: PaymentVouchersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "Create a DRAFT payment voucher across one or more supplier invoices (BR-PROC-04)" })
  @ApiResponse({ status: 201, type: PaymentVoucherResponseDto })
  async create(@Body() dto: CreatePaymentVoucherDto, @Req() req: AuthenticatedRequest): Promise<PaymentVoucherResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.paymentVouchersService.create(
        manager,
        {
          supplierId: dto.supplierId,
          method: dto.method,
          bankAccountId: dto.bankAccountId ?? null,
          chequeLeafId: dto.chequeLeafId ?? null,
          allocations: dto.allocations.map((allocation) => ({
            supplierInvoiceId: allocation.supplierInvoiceId,
            amount: Money.fromDecimalString(allocation.amount),
          })),
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "List payment vouchers, optionally filtered by status/supplier" })
  @ApiResponse({ status: 200, type: [PaymentVoucherResponseDto] })
  async list(
    @Query("status") status?: ProcPaymentVoucherStatus,
    @Query("supplierId") supplierId?: string,
  ): Promise<PaymentVoucherResponseDto[]> {
    return (await this.paymentVouchersService.list({ status, supplierId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "Get a payment voucher by id" })
  @ApiResponse({ status: 200, type: PaymentVoucherResponseDto })
  async findOne(@Param("id") id: string): Promise<PaymentVoucherResponseDto> {
    return toView(await this.paymentVouchersService.findByIdOrFail(id));
  }

  @Get(":id/allocations")
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "List a payment voucher's invoice allocations" })
  @ApiResponse({ status: 200, type: [PaymentVoucherAllocationResponseDto] })
  async listAllocations(@Param("id") id: string): Promise<PaymentVoucherAllocationResponseDto[]> {
    return (await this.paymentVouchersService.listAllocations(id)).map(toAllocationView);
  }

  @Post(":id/submit")
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "Submit a DRAFT voucher for approval (SUPPLIER_PAYMENTS chain — see PaymentVouchersService's doc comment)" })
  @ApiResponse({ status: 200, type: PaymentVoucherResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PaymentVoucherResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const voucher = await runInTransaction(this.dataSource, (manager) => this.paymentVouchersService.submitForApproval(manager, id, initiatorId));
    return toView(voucher);
  }

  @Post(":id/approve")
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL voucher (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: PaymentVoucherResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PaymentVoucherResponseDto> {
    return toView(await this.paymentVouchersService.onApprovalDecided(id, true, req.user?.sub ?? null));
  }

  @Post(":id/reject")
  @RequirePermission("procurement:payment-voucher:manage")
  @ApiOperation({ summary: "Manually record REJECTED for a PENDING_APPROVAL voucher (returns it to DRAFT)" })
  @ApiResponse({ status: 200, type: PaymentVoucherResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PaymentVoucherResponseDto> {
    return toView(await this.paymentVouchersService.onApprovalDecided(id, false, req.user?.sub ?? null));
  }

  @Post(":id/execute")
  @RequirePermission("procurement:payment-voucher:execute")
  @ApiOperation({ summary: "Execute an APPROVED voucher (realizes P-21, updates invoice paid_amount/status, attempts remittance advice email)" })
  @ApiResponse({ status: 200, type: PaymentVoucherResponseDto })
  async execute(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PaymentVoucherResponseDto> {
    const executedBy = requireUserId(req, "execute");
    const voucher = await runInTransaction(this.dataSource, (manager) => this.paymentVouchersService.execute(manager, id, executedBy));
    return toView(voucher);
  }
}
