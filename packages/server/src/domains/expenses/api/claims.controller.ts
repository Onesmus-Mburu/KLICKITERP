import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { ClaimsService } from "../application/claims.service";
import { ExpClaimEntity, ExpClaimStatus } from "../domain/exp-claim.entity";
import { ExpClaimLineEntity } from "../domain/exp-claim-line.entity";
import {
  AddClaimLineDto,
  ClaimLineResponseDto,
  ClaimResponseDto,
  CreateClaimDto,
  ReimburseClaimDto,
  UpdateClaimLineDto,
} from "./dto/claim.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ExpClaimEntity): ClaimResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    staffUserId: entity.staffUserId,
    total: entity.total.toDecimalString(),
    status: entity.status,
    reimburseVia: entity.reimburseVia,
    approvalRef: entity.approvalRef,
  };
}

function toLineView(entity: ExpClaimLineEntity): ClaimLineResponseDto {
  return {
    id: entity.id,
    claimId: entity.claimId,
    lineNo: entity.lineNo,
    categoryId: entity.categoryId,
    description: entity.description,
    amount: entity.amount.toDecimalString(),
    expenseDate: entity.expenseDate,
    receiptFileId: entity.receiptFileId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ClaimsController.${action}: no authenticated user on request`);
  return userId;
}

/** `exp_claim` (+lines) CRUD (DRAFT-only line edits) + submit -> approve/reject -> reimburse (DIRECT/PAYROLL). */
@ApiTags("expenses-claims")
@Controller("expenses/claims")
export class ClaimsController {
  constructor(
    private readonly claimsService: ClaimsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "Create a DRAFT expense claim (staffUserId = the caller, unless the caller is filing on someone else's behalf)" })
  @ApiResponse({ status: 201, type: ClaimResponseDto })
  async create(@Body() dto: CreateClaimDto, @Req() req: AuthenticatedRequest): Promise<ClaimResponseDto> {
    const created = await this.claimsService.create({ staffUserId: dto.staffUserId, reimburseVia: dto.reimburseVia }, req.user?.sub ?? null);
    return toView(created);
  }

  @Get()
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "List claims, optionally filtered by staffUserId and/or status" })
  @ApiResponse({ status: 200, type: [ClaimResponseDto] })
  async list(@Query("staffUserId") staffUserId?: string, @Query("status") status?: ExpClaimStatus): Promise<ClaimResponseDto[]> {
    return (await this.claimsService.list(staffUserId, status)).map(toView);
  }

  @Get(":id")
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "Get a claim by id" })
  @ApiResponse({ status: 200, type: ClaimResponseDto })
  async findOne(@Param("id") id: string): Promise<ClaimResponseDto> {
    return toView(await this.claimsService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "List a claim's lines" })
  @ApiResponse({ status: 200, type: [ClaimLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<ClaimLineResponseDto[]> {
    return (await this.claimsService.listLines(id)).map(toLineView);
  }

  @Post(":id/lines")
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "Add a line to a DRAFT claim" })
  @ApiResponse({ status: 201, type: ClaimLineResponseDto })
  async addLine(@Param("id") id: string, @Body() dto: AddClaimLineDto, @Req() req: AuthenticatedRequest): Promise<ClaimLineResponseDto> {
    const line = await this.claimsService.addLine(
      id,
      {
        categoryId: dto.categoryId,
        description: dto.description,
        amount: Money.fromDecimalString(dto.amount),
        expenseDate: dto.expenseDate,
        receiptFileId: dto.receiptFileId ?? null,
      },
      req.user?.sub ?? null,
    );
    return toLineView(line);
  }

  @Patch("lines/:lineId")
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "Update a line on a DRAFT claim" })
  @ApiResponse({ status: 200, type: ClaimLineResponseDto })
  async updateLine(@Param("lineId") lineId: string, @Body() dto: UpdateClaimLineDto, @Req() req: AuthenticatedRequest): Promise<ClaimLineResponseDto> {
    const updated = await this.claimsService.updateLine(
      lineId,
      {
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount !== undefined ? Money.fromDecimalString(dto.amount) : undefined,
        expenseDate: dto.expenseDate,
        receiptFileId: dto.receiptFileId,
      },
      req.user?.sub ?? null,
    );
    return toLineView(updated);
  }

  @Delete("lines/:lineId")
  @RequirePermission("expenses:claim:create")
  @ApiOperation({ summary: "Remove a line from a DRAFT claim" })
  @ApiResponse({ status: 200 })
  async removeLine(@Param("lineId") lineId: string, @Req() req: AuthenticatedRequest): Promise<{ deleted: boolean }> {
    await this.claimsService.removeLine(lineId, req.user?.sub ?? null);
    return { deleted: true };
  }

  @Post(":id/submit")
  @RequirePermission("expenses:claim:submit")
  @ApiOperation({ summary: "Submit a DRAFT claim for approval (EXPENSE_CLAIMS chain)" })
  @ApiResponse({ status: 200, type: ClaimResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClaimResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const claim = await runInTransaction(this.dataSource, (manager) => this.claimsService.submit(manager, id, initiatorId));
    return toView(claim);
  }

  @Post(":id/approve")
  @RequirePermission("expenses:claim:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL claim (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: ClaimResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClaimResponseDto> {
    const claim = await runInTransaction(this.dataSource, (manager) =>
      this.claimsService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(claim);
  }

  @Post(":id/reject")
  @RequirePermission("expenses:claim:decide")
  @ApiOperation({ summary: "Manually record REJECTED for a PENDING_APPROVAL claim" })
  @ApiResponse({ status: 200, type: ClaimResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ClaimResponseDto> {
    const claim = await runInTransaction(this.dataSource, (manager) =>
      this.claimsService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(claim);
  }

  @Post(":id/reimburse")
  @RequirePermission("expenses:claim:reimburse")
  @ApiOperation({ summary: "Reimburse an APPROVED claim — DIRECT posts real cash (method required); PAYROLL posts an accrual to Staff Reimbursements Payable (2040), settled later by Module 15" })
  @ApiResponse({ status: 200, type: ClaimResponseDto })
  async reimburse(@Param("id") id: string, @Body() dto: ReimburseClaimDto, @Req() req: AuthenticatedRequest): Promise<ClaimResponseDto> {
    const reimbursedBy = requireUserId(req, "reimburse");
    const claim = await runInTransaction(this.dataSource, (manager) => this.claimsService.reimburse(manager, id, reimbursedBy, dto.method));
    return toView(claim);
  }
}
