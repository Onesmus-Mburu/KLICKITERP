import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { RefundVouchersService } from "../application/refund-vouchers.service";
import { BillRefundVoucherEntity } from "../domain/bill-refund-voucher.entity";
import {
  CreateRefundVoucherDto,
  DecideRefundVoucherDto,
  MarkRefundVoucherPaidDto,
  RefundVoucherResponseDto,
} from "./dto/refund-voucher.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillRefundVoucherEntity): RefundVoucherResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    studentId: entity.studentId,
    amount: entity.amount.toDecimalString(),
    method: entity.method,
    payee: entity.payee,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    b2cTransactionId: entity.b2cTransactionId,
  };
}

/**
 * `bill_refund_voucher` — FR-BILL-052.1. `decide`/`mark-paid` are interim
 * manual triggers (no automatic dispatcher off `ApprovalEngineService.decide()`,
 * and no real M-Pesa B2C result callback — Module 10/Payments doesn't exist
 * yet — see `RefundVouchersService`'s doc comment for both gaps).
 */
@ApiTags("billing-refund-vouchers")
@Controller("billing/refund-vouchers")
export class RefundVouchersController {
  constructor(private readonly service: RefundVouchersService) {}

  @Post()
  @RequirePermission("billing:refund-voucher:manage")
  @ApiOperation({ summary: "Create a DRAFT refund voucher (validated against the student's credit balance, BR-BILL-12)" })
  @ApiResponse({ status: 201, type: RefundVoucherResponseDto })
  async create(@Body() dto: CreateRefundVoucherDto, @Req() req: AuthenticatedRequest): Promise<RefundVoucherResponseDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("RefundVouchersController.create: no authenticated user on request");
    return toView(
      await this.service.create(
        { studentId: dto.studentId, amount: Money.fromDecimalString(dto.amount), method: dto.method, payee: dto.payee },
        initiatedBy,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:refund-voucher:view")
  @ApiOperation({ summary: "List refund vouchers for a student" })
  @ApiResponse({ status: 200, type: [RefundVoucherResponseDto] })
  async list(@Query("studentId") studentId: string): Promise<RefundVoucherResponseDto[]> {
    return (await this.service.listByStudent(studentId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:refund-voucher:view")
  @ApiOperation({ summary: "Get a refund voucher by id" })
  @ApiResponse({ status: 200, type: RefundVoucherResponseDto })
  async findOne(@Param("id") id: string): Promise<RefundVoucherResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Post(":id/submit")
  @RequirePermission("billing:refund-voucher:manage")
  @ApiOperation({ summary: "Submit a DRAFT refund voucher for approval (domainCode REFUNDS)" })
  @ApiResponse({ status: 200, type: RefundVoucherResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RefundVoucherResponseDto> {
    const initiatorId = req.user?.sub;
    if (!initiatorId) throw new Error("RefundVouchersController.submit: no authenticated user on request");
    return toView(await this.service.submitForApproval(id, initiatorId));
  }

  @Post(":id/decide")
  @RequirePermission("billing:refund-voucher:manage")
  @ApiOperation({ summary: "Approve (posts P-12, status APPROVED_UNPAID) or reject (CANCELLED) a PENDING_APPROVAL refund voucher" })
  @ApiResponse({ status: 200, type: RefundVoucherResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideRefundVoucherDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RefundVoucherResponseDto> {
    return toView(await this.service.onApprovalDecided(id, dto.approved, req.user?.sub ?? null));
  }

  @Post(":id/mark-paid")
  @RequirePermission("billing:refund-voucher:mark-paid")
  @ApiOperation({ summary: "Mark an APPROVED_UNPAID refund voucher PAID (interim placeholder for the Module 10 B2C callback)" })
  @ApiResponse({ status: 200, type: RefundVoucherResponseDto })
  async markPaid(
    @Param("id") id: string,
    @Body() dto: MarkRefundVoucherPaidDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RefundVoucherResponseDto> {
    return toView(await this.service.markPaid(id, dto.b2cTransactionId ?? null, req.user?.sub ?? null));
  }

  @Post(":id/cancel")
  @RequirePermission("billing:refund-voucher:manage")
  @ApiOperation({ summary: "Cancel a refund voucher from any pre-PAID status" })
  @ApiResponse({ status: 200, type: RefundVoucherResponseDto })
  async cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RefundVoucherResponseDto> {
    return toView(await this.service.cancel(id, req.user?.sub ?? null));
  }
}
