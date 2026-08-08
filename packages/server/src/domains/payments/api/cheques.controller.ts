import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { ChequesService } from "../application/cheques.service";
import { PayChequeEntity } from "../domain/pay-cheque.entity";
import { BounceChequeDto, ChequeResponseDto } from "./dto/cheque.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayChequeEntity): ChequeResponseDto {
  return {
    id: entity.id,
    bankName: entity.bankName,
    chequeNo: entity.chequeNo,
    chequeDate: entity.chequeDate,
    drawer: entity.drawer,
    amount: entity.amount.toDecimalString(),
    status: entity.status,
    statusChangedAt: entity.statusChangedAt,
    bounceFeeApplied: entity.bounceFeeApplied,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ChequesController.${action}: no authenticated user on request`);
  return userId;
}

/** `pay_cheque` — FR-PAY-007.1 clearance/bounce lifecycle. See `ChequesService.bounce()`'s doc comment for the single-split-vs-multi-split reversal distinction. */
@ApiTags("payments-cheques")
@Controller("payments/cheques")
export class ChequesController {
  constructor(
    private readonly chequesService: ChequesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @RequirePermission("payments:cheque:manage")
  @ApiOperation({ summary: "List every UNCLEARED cheque" })
  @ApiResponse({ status: 200, type: [ChequeResponseDto] })
  async listUncleared(): Promise<ChequeResponseDto[]> {
    return (await this.chequesService.listUncleared()).map(toView);
  }

  @Get(":id")
  @RequirePermission("payments:cheque:manage")
  @ApiOperation({ summary: "Get a cheque by id" })
  @ApiResponse({ status: 200, type: ChequeResponseDto })
  async findOne(@Param("id") id: string): Promise<ChequeResponseDto> {
    return toView(await this.chequesService.findByIdOrFail(id));
  }

  @Post(":id/clear")
  @RequirePermission("payments:cheque:manage")
  @ApiOperation({ summary: "Mark an UNCLEARED cheque CLEARED" })
  @ApiResponse({ status: 200, type: ChequeResponseDto })
  async clear(@Param("id") id: string): Promise<ChequeResponseDto> {
    return toView(await this.chequesService.clear(id));
  }

  @Post(":id/bounce")
  @RequirePermission("payments:cheque:manage")
  @ApiOperation({ summary: "Bounce an UNCLEARED cheque (P-11), optionally applying a bounce fee (P-05)" })
  @ApiResponse({ status: 200, type: ChequeResponseDto })
  async bounce(
    @Param("id") id: string,
    @Body() dto: BounceChequeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChequeResponseDto> {
    const actorId = requireUserId(req, "bounce");
    const cheque = await runInTransaction(this.dataSource, (em) => this.chequesService.bounce(em, id, dto.applyBounceFee ?? false, actorId));
    return toView(cheque);
  }
}
