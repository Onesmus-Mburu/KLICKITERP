import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { Public } from "../../../platform/auth";
import { MpesaService } from "../application/mpesa.service";
import { PayMpesaTransactionEntity } from "../domain/pay-mpesa-transaction.entity";
import { PayMpesaTransactionRepository } from "../infrastructure/pay-mpesa-transaction.repository";
import { InitiateB2cDto, InitiateStkDto, MpesaTransactionResponseDto } from "./dto/mpesa.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayMpesaTransactionEntity): MpesaTransactionResponseDto {
  return {
    id: entity.id,
    kind: entity.kind,
    shortcode: entity.shortcode,
    msisdnMasked: entity.msisdnMasked,
    amount: entity.amount.toDecimalString(),
    mpesaRef: entity.mpesaRef,
    checkoutRequestId: entity.checkoutRequestId,
    conversationId: entity.conversationId,
    state: entity.state,
    matchedReceiptId: entity.matchedReceiptId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`MpesaController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `pay_mpesa_transaction` — authenticated STK/B2C initiation, plus the four
 * Safaricom-inbound Daraja callback endpoints.
 *
 * **Security note on the four `/callbacks/mpesa/*` endpoints**: these are
 * intentionally `@Public()` (no JWT guard) — Safaricom's Daraja platform
 * cannot hold or present this system's bearer tokens, so an authenticated
 * route is not an option for a genuinely inbound webhook. Per
 * docs/phase-3/01-system-architecture.md's deployment architecture, the real
 * defense here is an **Nginx/deployment-layer** concern, not application
 * code: restrict these four paths to Safaricom's published Daraja IP
 * allowlist, and (where Daraja supports it for the callback in question)
 * verify a request signature/shared-secret header at the reverse-proxy layer
 * before the request ever reaches this controller. `MpesaService`'s own
 * handlers perform strict payload-shape validation and idempotent-replay
 * handling (BR-PAY-06) as a second layer, but neither replaces network-layer
 * allowlisting — this pass does not implement IP allowlisting or Daraja
 * signature verification in application code, consistent with every other
 * inbound-webhook precedent in this codebase (none exist yet elsewhere) and
 * the architecture doc's own layering.
 */
@ApiTags("payments-mpesa")
@Controller()
export class MpesaController {
  constructor(
    private readonly mpesaService: MpesaService,
    private readonly mpesaTransactionRepository: PayMpesaTransactionRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("payments/mpesa/stk")
  @RequirePermission("payments:mpesa:initiate")
  @ApiOperation({ summary: "Initiate an STK push against a student's fee balance" })
  @ApiResponse({ status: 201, type: MpesaTransactionResponseDto })
  async initiateStk(@Body() dto: InitiateStkDto, @Req() req: AuthenticatedRequest): Promise<MpesaTransactionResponseDto> {
    const initiatedBy = requireUserId(req, "initiateStk");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.mpesaService.initiateStk(
        em,
        {
          studentId: dto.studentId,
          amountKes: Money.fromDecimalString(dto.amountKes),
          msisdn: dto.msisdn,
          accountRef: dto.accountRef,
          invoiceIds: dto.invoiceIds,
        },
        initiatedBy,
      ),
    );
    return toView(txn);
  }

  @Get("payments/mpesa/:id")
  @RequirePermission("payments:mpesa:initiate")
  @ApiOperation({ summary: "Fetch the current state of an M-Pesa transaction (STK/B2C) by id" })
  @ApiResponse({ status: 200, type: MpesaTransactionResponseDto })
  async findOne(@Param("id") id: string): Promise<MpesaTransactionResponseDto> {
    const txn = await this.mpesaTransactionRepository.findByIdOrFail(id);
    return toView(txn);
  }

  @Post("payments/mpesa/:id/query-status")
  @RequirePermission("payments:mpesa:initiate")
  @ApiOperation({ summary: "Force a real Daraja STK status-query fallback for a pending transaction (FR-PAY-008.1)" })
  @ApiResponse({ status: 201, type: MpesaTransactionResponseDto })
  async queryStatus(@Param("id") id: string): Promise<MpesaTransactionResponseDto> {
    const txn = await this.mpesaService.queryPendingStatus(id);
    return toView(txn);
  }

  @Post("payments/mpesa/b2c")
  @RequirePermission("payments:mpesa:initiate")
  @ApiOperation({ summary: "Initiate a B2C payout (e.g. a refund voucher payout)" })
  @ApiResponse({ status: 201, type: MpesaTransactionResponseDto })
  async initiateB2c(@Body() dto: InitiateB2cDto, @Req() req: AuthenticatedRequest): Promise<MpesaTransactionResponseDto> {
    const initiatedBy = requireUserId(req, "initiateB2c");
    const txn = await runInTransaction(this.dataSource, (em) =>
      this.mpesaService.initiateB2c(
        em,
        { amountKes: Money.fromDecimalString(dto.amountKes), msisdn: dto.msisdn, remarks: dto.remarks, originatingReason: dto.originatingReason },
        initiatedBy,
      ),
    );
    return toView(txn);
  }

  @Post("callbacks/mpesa/stk")
  @Public()
  @ApiOperation({ summary: "Daraja STK callback (unauthenticated — see controller doc comment)" })
  @ApiBody({ schema: { type: "object" } })
  async stkCallback(@Body() payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    return this.mpesaService.handleStkCallback(payload);
  }

  @Post("callbacks/mpesa/c2b/validation")
  @Public()
  @ApiOperation({ summary: "Daraja C2B Validation callback (unauthenticated — see controller doc comment)" })
  @ApiBody({ schema: { type: "object" } })
  async c2bValidation(@Body() payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    return this.mpesaService.handleC2BValidation(payload);
  }

  @Post("callbacks/mpesa/c2b/confirmation")
  @Public()
  @ApiOperation({ summary: "Daraja C2B Confirmation callback (unauthenticated — see controller doc comment)" })
  @ApiBody({ schema: { type: "object" } })
  async c2bConfirmation(@Body() payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    return this.mpesaService.handleC2BConfirmation(payload);
  }

  @Post("callbacks/mpesa/b2c-result")
  @Public()
  @ApiOperation({ summary: "Daraja B2C Result callback (unauthenticated — see controller doc comment)" })
  @ApiBody({ schema: { type: "object" } })
  async b2cResult(@Body() payload: unknown): Promise<{ resultCode: string }> {
    return this.mpesaService.handleB2cResult(payload);
  }
}
