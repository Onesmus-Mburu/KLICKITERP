import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { ConcessionsService } from "../application/concessions.service";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { ConcessionResponseDto, DecideConcessionDto, RequestConcessionDto } from "./dto/concession.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillConcessionEntity): ConcessionResponseDto {
  return {
    id: entity.id,
    kind: entity.kind,
    schemeId: entity.schemeId,
    studentId: entity.studentId,
    invoiceId: entity.invoiceId,
    invoiceLineId: entity.invoiceLineId,
    sponsorAwardId: entity.sponsorAwardId,
    amount: entity.amount.toDecimalString(),
    reason: entity.reason,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

/**
 * `bill_concession` — request/decide/standalone-post. `decide`/`post-standalone`
 * are manual-trigger interim actions standing in for a real event-driven
 * dispatcher off `ApprovalEngineService.decide()` (no such dispatcher exists
 * anywhere in this codebase yet — see `ConcessionsService`'s doc comment,
 * same shape as `BudgetsController`'s `activate`/`reject`).
 */
@ApiTags("billing-concessions")
@Controller("billing/concessions")
export class ConcessionsController {
  constructor(private readonly service: ConcessionsService) {}

  @Post()
  @RequirePermission("billing:concession:request")
  @ApiOperation({ summary: "Request a concession/waiver (starts PENDING_APPROVAL, BR-BILL-07)" })
  @ApiResponse({ status: 201, type: ConcessionResponseDto })
  async request(@Body() dto: RequestConcessionDto, @Req() req: AuthenticatedRequest): Promise<ConcessionResponseDto> {
    const initiatorId = req.user?.sub;
    if (!initiatorId) throw new Error("ConcessionsController.request: no authenticated user on request");
    return toView(
      await this.service.requestConcession(
        {
          kind: dto.kind,
          schemeId: dto.schemeId ?? null,
          studentId: dto.studentId,
          invoiceId: dto.invoiceId ?? null,
          invoiceLineId: dto.invoiceLineId ?? null,
          sponsorAwardId: dto.sponsorAwardId ?? null,
          amount: Money.fromDecimalString(dto.amount),
          reason: dto.reason,
        },
        initiatorId,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:concession:view")
  @ApiOperation({ summary: "List concessions for an invoice or a student" })
  @ApiResponse({ status: 200, type: [ConcessionResponseDto] })
  async list(
    @Query("invoiceId") invoiceId?: string,
    @Query("studentId") studentId?: string,
  ): Promise<ConcessionResponseDto[]> {
    if (invoiceId) return (await this.service.listByInvoice(invoiceId)).map(toView);
    if (studentId) return (await this.service.listByStudent(studentId)).map(toView);
    return [];
  }

  @Get(":id")
  @RequirePermission("billing:concession:view")
  @ApiOperation({ summary: "Get a concession by id" })
  @ApiResponse({ status: 200, type: ConcessionResponseDto })
  async findOne(@Param("id") id: string): Promise<ConcessionResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Post(":id/decide")
  @RequirePermission("billing:concession:decide")
  @ApiOperation({ summary: "Approve/reject a PENDING_APPROVAL concession (interim manual trigger)" })
  @ApiResponse({ status: 200, type: ConcessionResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideConcessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConcessionResponseDto> {
    return toView(await this.service.onApprovalDecided(id, dto.approved, req.user?.sub ?? null));
  }

  @Post(":id/post-standalone")
  @RequirePermission("billing:concession:decide")
  @ApiOperation({ summary: "Post an APPROVED concession standalone against an already-POSTED invoice" })
  @ApiResponse({ status: 200, type: ConcessionResponseDto })
  async postStandalone(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ConcessionResponseDto> {
    const actorId = req.user?.sub;
    if (!actorId) throw new Error("ConcessionsController.postStandalone: no authenticated user on request");
    return toView(await this.service.postStandalone(id, actorId));
  }
}
