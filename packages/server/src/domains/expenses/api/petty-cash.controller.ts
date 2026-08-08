import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { PettyCashService } from "../application/petty-cash.service";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "../domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "../domain/exp-replenishment.entity";
import {
  CreateFloatDto,
  FloatResponseDto,
  PettyCashVoucherResponseDto,
  ReplenishmentResponseDto,
  SpendDto,
  UpdateFloatCeilingDto,
} from "./dto/petty-cash.dto";
import { AuthenticatedRequest } from "./request-context";

function toFloatView(entity: ExpPettyCashFloatEntity): FloatResponseDto {
  return {
    id: entity.id,
    custodianUserId: entity.custodianUserId,
    ceiling: entity.ceiling.toDecimalString(),
    balance: entity.balance.toDecimalString(),
  };
}

function toVoucherView(entity: ExpPettyCashVoucherEntity): PettyCashVoucherResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    floatId: entity.floatId,
    categoryId: entity.categoryId,
    amount: entity.amount.toDecimalString(),
    receiptFileId: entity.receiptFileId,
    status: entity.status,
    journalId: entity.journalId,
  };
}

function toReplenishmentView(entity: ExpReplenishmentEntity): ReplenishmentResponseDto {
  return {
    id: entity.id,
    floatId: entity.floatId,
    amount: entity.amount.toDecimalString(),
    voucherIds: entity.voucherIds,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`PettyCashController.${action}: no authenticated user on request`);
  return userId;
}

/** Float CRUD + spend + replenishment request/decide/execute (FR-EXP-003.1, BR-EXP-02, P-26). */
@ApiTags("expenses-petty-cash")
@Controller("expenses/petty-cash")
export class PettyCashController {
  constructor(
    private readonly pettyCashService: PettyCashService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("floats")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "Create a petty cash float for a custodian (one per custodian, balance starts fully funded at ceiling — see PettyCashService's doc comment)" })
  @ApiResponse({ status: 201, type: FloatResponseDto })
  async createFloat(@Body() dto: CreateFloatDto, @Req() req: AuthenticatedRequest): Promise<FloatResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.pettyCashService.createFloat(
        manager,
        { custodianUserId: dto.custodianUserId, ceiling: Money.fromDecimalString(dto.ceiling) },
        req.user?.sub ?? null,
      ),
    );
    return toFloatView(created);
  }

  @Get("floats")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "List petty cash floats" })
  @ApiResponse({ status: 200, type: [FloatResponseDto] })
  async listFloats(): Promise<FloatResponseDto[]> {
    return (await this.pettyCashService.listFloats()).map(toFloatView);
  }

  @Get("floats/:id")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "Get a float by id" })
  @ApiResponse({ status: 200, type: FloatResponseDto })
  async findFloat(@Param("id") id: string): Promise<FloatResponseDto> {
    return toFloatView(await this.pettyCashService.findFloatByIdOrFail(id));
  }

  @Patch("floats/:id/ceiling")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "Update a float's ceiling (cannot go below the current balance)" })
  @ApiResponse({ status: 200, type: FloatResponseDto })
  async updateCeiling(@Param("id") id: string, @Body() dto: UpdateFloatCeilingDto, @Req() req: AuthenticatedRequest): Promise<FloatResponseDto> {
    const updated = await this.pettyCashService.updateCeiling(id, Money.fromDecimalString(dto.ceiling), req.user?.sub ?? null);
    return toFloatView(updated);
  }

  @Post("floats/:id/spend")
  @RequirePermission("expenses:petty-cash:spend")
  @ApiOperation({ summary: "Spend against a float (BR-EXP-02 balance-floor check; no per-voucher approval or GL posting — see PettyCashService's doc comment)" })
  @ApiResponse({ status: 201, type: PettyCashVoucherResponseDto })
  async spend(@Param("id") floatId: string, @Body() dto: SpendDto, @Req() req: AuthenticatedRequest): Promise<PettyCashVoucherResponseDto> {
    const actorId = requireUserId(req, "spend");
    const voucher = await runInTransaction(this.dataSource, (manager) =>
      this.pettyCashService.spend(
        manager,
        { floatId, categoryId: dto.categoryId, amount: Money.fromDecimalString(dto.amount), receiptFileId: dto.receiptFileId ?? null },
        actorId,
      ),
    );
    return toVoucherView(voucher);
  }

  @Get("floats/:id/vouchers")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "List a float's petty cash vouchers" })
  @ApiResponse({ status: 200, type: [PettyCashVoucherResponseDto] })
  async listVouchers(@Param("id") floatId: string): Promise<PettyCashVoucherResponseDto[]> {
    return (await this.pettyCashService.listVouchersByFloat(floatId)).map(toVoucherView);
  }

  @Post("floats/:id/replenishments")
  @RequirePermission("expenses:petty-cash:replenish-request")
  @ApiOperation({ summary: "Request a replenishment (collects unclaimed APPROVED vouchers since the last replenishment, submits for approval)" })
  @ApiResponse({ status: 201, type: ReplenishmentResponseDto })
  async requestReplenishment(@Param("id") floatId: string, @Req() req: AuthenticatedRequest): Promise<ReplenishmentResponseDto> {
    const initiatedBy = requireUserId(req, "requestReplenishment");
    const replenishment = await runInTransaction(this.dataSource, (manager) =>
      this.pettyCashService.requestReplenishment(manager, floatId, initiatedBy),
    );
    return toReplenishmentView(replenishment);
  }

  @Get("floats/:id/replenishments")
  @RequirePermission("expenses:petty-cash:manage")
  @ApiOperation({ summary: "List a float's replenishment requests" })
  @ApiResponse({ status: 200, type: [ReplenishmentResponseDto] })
  async listReplenishments(@Param("id") floatId: string): Promise<ReplenishmentResponseDto[]> {
    return (await this.pettyCashService.listReplenishmentsByFloat(floatId)).map(toReplenishmentView);
  }

  @Post("replenishments/:id/approve")
  @RequirePermission("expenses:petty-cash:replenish-decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL replenishment" })
  @ApiResponse({ status: 200, type: ReplenishmentResponseDto })
  async approveReplenishment(@Param("id") id: string): Promise<ReplenishmentResponseDto> {
    const replenishment = await runInTransaction(this.dataSource, (manager) => this.pettyCashService.onApprovalDecided(manager, id, true));
    return toReplenishmentView(replenishment);
  }

  @Post("replenishments/:id/reject")
  @RequirePermission("expenses:petty-cash:replenish-decide")
  @ApiOperation({ summary: "Reject a PENDING_APPROVAL replenishment (the row is deleted — see PettyCashService's doc comment; the same vouchers can be resubmitted later)" })
  @ApiResponse({ status: 200, type: ReplenishmentResponseDto })
  async rejectReplenishment(@Param("id") id: string): Promise<ReplenishmentResponseDto> {
    const replenishment = await runInTransaction(this.dataSource, (manager) => this.pettyCashService.onApprovalDecided(manager, id, false));
    return toReplenishmentView(replenishment);
  }

  @Post("replenishments/:id/execute")
  @RequirePermission("expenses:petty-cash:replenish-execute")
  @ApiOperation({ summary: "Execute an APPROVED replenishment (realizes P-26, restores the float balance toward its ceiling, capped)" })
  @ApiResponse({ status: 200, type: ReplenishmentResponseDto })
  async executeReplenishment(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ReplenishmentResponseDto> {
    const executedBy = requireUserId(req, "executeReplenishment");
    const replenishment = await runInTransaction(this.dataSource, (manager) => this.pettyCashService.execute(manager, id, executedBy));
    return toReplenishmentView(replenishment);
  }
}
