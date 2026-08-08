import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { CashierSessionsService } from "../application/cashier-sessions.service";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { CashierSessionResponseDto, CloseSessionDto, OpenSessionDto } from "./dto/cashier-session.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayCashierSessionEntity): CashierSessionResponseDto {
  return {
    id: entity.id,
    cashierId: entity.cashierId,
    till: entity.till,
    status: entity.status,
    openedAt: entity.openedAt,
    floatAmount: entity.floatAmount.toDecimalString(),
    closedAt: entity.closedAt,
    counted: entity.counted,
    expectedTotals: entity.expectedTotals,
    varianceAmount: entity.varianceAmount ? entity.varianceAmount.toDecimalString() : null,
    varianceReason: entity.varianceReason,
    supervisorId: entity.supervisorId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`CashierSessionsController.${action}: no authenticated user on request`);
  return userId;
}

/** `pay_cashier_session` — BR-PAY-04/BR-PAY-05 open/close workflow (FR-PAY-011.1). */
@ApiTags("payments-cashier-sessions")
@Controller("payments/sessions")
export class CashierSessionsController {
  constructor(private readonly sessionsService: CashierSessionsService) {}

  @Post("open")
  @RequirePermission("payments:session:open")
  @ApiOperation({ summary: "Open a cashier session (BR-PAY-04: at most one OPEN session per cashier)" })
  @ApiResponse({ status: 201, type: CashierSessionResponseDto })
  async open(@Body() dto: OpenSessionDto, @Req() req: AuthenticatedRequest): Promise<CashierSessionResponseDto> {
    const cashierId = requireUserId(req, "open");
    return toView(await this.sessionsService.openSession(cashierId, dto.till, Money.fromDecimalString(dto.floatAmount)));
  }

  @Post(":id/close")
  @RequirePermission("payments:session:close")
  @ApiOperation({ summary: "Close a cashier session — beyond payments.session_variance_tolerance requires a supervisor approval (BR-PAY-05)" })
  @ApiResponse({ status: 200, type: CashierSessionResponseDto })
  async close(
    @Param("id") id: string,
    @Body() dto: CloseSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CashierSessionResponseDto> {
    const closedBy = requireUserId(req, "close");
    return toView(
      await this.sessionsService.closeSession(
        id,
        dto.counted,
        closedBy,
        dto.approval ? { supervisorId: dto.approval.supervisorId, varianceReason: dto.approval.varianceReason } : undefined,
      ),
    );
  }

  @Get("mine")
  @RequirePermission("payments:session:view")
  @ApiOperation({ summary: "The calling cashier's currently OPEN session, if any" })
  @ApiResponse({ status: 200, type: CashierSessionResponseDto, description: "null when no session is OPEN" })
  async mine(@Req() req: AuthenticatedRequest): Promise<CashierSessionResponseDto | null> {
    const cashierId = requireUserId(req, "mine");
    const session = await this.sessionsService.getOpenSessionForCashier(cashierId);
    return session ? toView(session) : null;
  }
}
