import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprovalEngineService } from "../../../platform/approvals";
import { PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE } from "../application/receipts.service";
import { SuspenseService } from "../application/suspense.service";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";
import {
  MatchSuspenseItemDto,
  ReverseSuspenseRefundDto,
  SuspenseItemResponseDto,
  SuspenseRefundApprovalResponseDto,
} from "./dto/suspense.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PaySuspenseItemEntity): SuspenseItemResponseDto {
  return {
    id: entity.id,
    source: entity.source,
    amount: entity.amount.toDecimalString(),
    externalRef: entity.externalRef,
    receivedAt: entity.receivedAt,
    state: entity.state,
    resolvedReceiptId: entity.resolvedReceiptId,
    resolvedBy: entity.resolvedBy,
    resolvedAt: entity.resolvedAt,
    resolutionNote: entity.resolutionNote,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`SuspenseController.${action}: no authenticated user on request`);
  return userId;
}

const SUSPENSE_ITEM_ENTITY_TYPE = "pay_suspense_item";

/**
 * `pay_suspense_item` — BR-PAY-07 ("unmatched C2B payments live in
 * suspense... resolvable only by matching to a student or by an
 * approval-gated refund; suspense may never be silently written off"). The
 * refund path reuses the same `PAYMENT_REVERSALS` approval workflow +
 * two-step submit/decide/execute dance `ReceiptsController.reverse()`
 * establishes (see that controller's doc comment) — both are "money leaving
 * through a manual correction path in Payments" and the `0900` seed
 * registers exactly one `PAYMENT_REVERSALS` `appr_workflow_def`, not two.
 */
@ApiTags("payments-suspense")
@Controller("payments/suspense")
export class SuspenseController {
  constructor(
    private readonly suspenseService: SuspenseService,
    private readonly approvalEngineService: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "List every OPEN suspense item, oldest received first" })
  @ApiResponse({ status: 200, type: [SuspenseItemResponseDto] })
  async listOpen(): Promise<SuspenseItemResponseDto[]> {
    return (await this.suspenseService.listOpen()).map(toView);
  }

  /**
   * Phase 6 Slice 6 — mirrors `ChequesController.findOne()` exactly
   * (`findByIdOrFail` + the existing `toView()` mapper, both already used by
   * every other handler in this controller). Closes the one real gap
   * blocking a clean `<EntityLabel>` resolution for `pay_suspense_item`
   * `PAYMENT_REVERSALS` approval rows on the frontend, and gives the
   * suspense refund UI a real detail route to link back to a resolved
   * (MATCHED/REFUNDED) item once it has scrolled off the OPEN-only list
   * above.
   */
  @Get(":id")
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "Get a suspense item by id" })
  @ApiResponse({ status: 200, type: SuspenseItemResponseDto })
  async findOne(@Param("id") id: string): Promise<SuspenseItemResponseDto> {
    return toView(await this.suspenseService.findByIdOrFail(id));
  }

  @Post(":id/match")
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "Match a suspense item to a student, retroactively capturing a receipt dated its own received_at" })
  @ApiResponse({ status: 200, type: SuspenseItemResponseDto })
  async match(
    @Param("id") id: string,
    @Body() dto: MatchSuspenseItemDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SuspenseItemResponseDto> {
    const matchedBy = requireUserId(req, "match");
    const item = await runInTransaction(this.dataSource, (em) => this.suspenseService.matchToStudent(em, id, dto.studentId, matchedBy));
    return toView(item);
  }

  @Post(":id/refund/request")
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "Submit a PAYMENT_REVERSALS approval instance for this suspense item's refund (BR-PAY-07 step 1 of 2)" })
  @ApiResponse({ status: 201, type: SuspenseRefundApprovalResponseDto })
  async requestRefund(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SuspenseRefundApprovalResponseDto> {
    const initiatorId = requireUserId(req, "requestRefund");
    return runInTransaction(this.dataSource, async (em) => {
      const item = await this.suspenseService.findByIdOrFail(id);
      const instance = await this.approvalEngineService.submit(em, {
        domainCode: PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE,
        entityType: SUSPENSE_ITEM_ENTITY_TYPE,
        entityId: id,
        amount: item.amount,
        initiatorId,
      });
      return { instanceId: instance.id, status: instance.status };
    });
  }

  @Post(":id/refund")
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "Refund a suspense item (BR-PAY-07 step 2 of 2 — requires an APPROVED PAYMENT_REVERSALS instance)" })
  @ApiResponse({ status: 200, type: SuspenseItemResponseDto })
  async refund(
    @Param("id") id: string,
    @Body() dto: ReverseSuspenseRefundDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SuspenseItemResponseDto> {
    const resolvedBy = requireUserId(req, "refund");
    const instance = await this.approvalEngineService.getStatus(SUSPENSE_ITEM_ENTITY_TYPE, id);
    if (!instance || instance.id !== dto.approvalRef || instance.status !== "APPROVED") {
      throw new ValidationException(
        `BR-PAY-07: approvalRef ${dto.approvalRef} is not an APPROVED PAYMENT_REVERSALS instance for suspense item ${id} — ` +
          "submit via POST .../refund/request and have it decided first",
      );
    }
    const item = await runInTransaction(this.dataSource, (em) => this.suspenseService.refundSuspenseItem(em, id, dto.approvalRef, resolvedBy));
    return toView(item);
  }
}
