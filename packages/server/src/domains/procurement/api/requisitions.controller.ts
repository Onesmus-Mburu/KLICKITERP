import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { RequisitionsService } from "../application/requisitions.service";
import { ProcRequisitionEntity, ProcRequisitionStatus } from "../domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";
import {
  CreateRequisitionDto,
  CreateRequisitionLineDto,
  RequisitionLineResponseDto,
  RequisitionResponseDto,
  UpdateRequisitionLineDto,
} from "./dto/requisition.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcRequisitionEntity): RequisitionResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    requestedBy: entity.requestedBy,
    departmentId: entity.departmentId,
    justification: entity.justification,
    status: entity.status,
    approvalRef: entity.approvalRef,
    budgetSnapshot: entity.budgetSnapshot,
    totalEstimate: entity.totalEstimate.toDecimalString(),
  };
}

function toLineView(entity: ProcRequisitionLineEntity): RequisitionLineResponseDto {
  return {
    id: entity.id,
    requisitionId: entity.requisitionId,
    itemId: entity.itemId,
    freeText: entity.freeText,
    qty: entity.qty,
    estPrice: entity.estPrice.toDecimalString(),
    budgetLineId: entity.budgetLineId,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`RequisitionsController.${action}: no authenticated user on request`);
  return userId;
}

/** `proc_requisition` (+lines) CRUD and the submit -> approve/reject -> cancel workflow (FR-PROC-002.1, BR-PROC-01/02). `submit()` opens its own transaction here since `RequisitionsService.submit()` takes the caller's `EntityManager` (mirrors `InvoicesController`'s pattern). */
@ApiTags("procurement-requisitions")
@Controller("procurement/requisitions")
export class RequisitionsController {
  constructor(
    private readonly requisitionsService: RequisitionsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("procurement:requisition:create")
  @ApiOperation({ summary: "Create a DRAFT requisition (requested_by = the caller)" })
  @ApiResponse({ status: 201, type: RequisitionResponseDto })
  async create(@Body() dto: CreateRequisitionDto, @Req() req: AuthenticatedRequest): Promise<RequisitionResponseDto> {
    const requestedBy = requireUserId(req, "create");
    const created = await this.requisitionsService.create(
      { requestedBy, departmentId: dto.departmentId, justification: dto.justification },
      requestedBy,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:requisition:view")
  @ApiOperation({ summary: "List requisitions, optionally filtered by status/department" })
  @ApiResponse({ status: 200, type: [RequisitionResponseDto] })
  async list(
    @Query("status") status?: ProcRequisitionStatus,
    @Query("departmentId") departmentId?: string,
  ): Promise<RequisitionResponseDto[]> {
    return (await this.requisitionsService.list({ status, departmentId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:requisition:view")
  @ApiOperation({ summary: "Get a requisition by id" })
  @ApiResponse({ status: 200, type: RequisitionResponseDto })
  async findOne(@Param("id") id: string): Promise<RequisitionResponseDto> {
    return toView(await this.requisitionsService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("procurement:requisition:view")
  @ApiOperation({ summary: "List a requisition's lines" })
  @ApiResponse({ status: 200, type: [RequisitionLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<RequisitionLineResponseDto[]> {
    return (await this.requisitionsService.listLines(id)).map(toLineView);
  }

  @Post(":id/lines")
  @RequirePermission("procurement:requisition:create")
  @ApiOperation({ summary: "Add a line to a DRAFT requisition" })
  @ApiResponse({ status: 201, type: RequisitionLineResponseDto })
  async addLine(
    @Param("id") id: string,
    @Body() dto: CreateRequisitionLineDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RequisitionLineResponseDto> {
    const line = await this.requisitionsService.addLine(
      id,
      {
        itemId: dto.itemId ?? null,
        freeText: dto.freeText ?? null,
        qty: dto.qty,
        estPrice: Money.fromDecimalString(dto.estPrice),
        budgetLineId: dto.budgetLineId ?? null,
      },
      req.user?.sub ?? null,
    );
    return toLineView(line);
  }

  @Patch("lines/:lineId")
  @RequirePermission("procurement:requisition:create")
  @ApiOperation({ summary: "Update a line on a DRAFT requisition" })
  @ApiResponse({ status: 200, type: RequisitionLineResponseDto })
  async updateLine(
    @Param("lineId") lineId: string,
    @Body() dto: UpdateRequisitionLineDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RequisitionLineResponseDto> {
    const updated = await this.requisitionsService.updateLine(
      lineId,
      {
        itemId: dto.itemId,
        freeText: dto.freeText,
        qty: dto.qty,
        estPrice: dto.estPrice !== undefined ? Money.fromDecimalString(dto.estPrice) : undefined,
        budgetLineId: dto.budgetLineId,
      },
      req.user?.sub ?? null,
    );
    return toLineView(updated);
  }

  @Delete("lines/:lineId")
  @RequirePermission("procurement:requisition:create")
  @ApiOperation({ summary: "Remove a line from a DRAFT requisition" })
  @ApiResponse({ status: 200 })
  async removeLine(@Param("lineId") lineId: string, @Req() req: AuthenticatedRequest): Promise<{ deleted: boolean }> {
    await this.requisitionsService.removeLine(lineId, req.user?.sub ?? null);
    return { deleted: true };
  }

  @Post(":id/submit")
  @RequirePermission("procurement:requisition:submit")
  @ApiOperation({ summary: "Submit a DRAFT requisition for approval (captures the BR-PROC-02 budget snapshot)" })
  @ApiResponse({ status: 200, type: RequisitionResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RequisitionResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const requisition = await runInTransaction(this.dataSource, (manager) => this.requisitionsService.submit(manager, id, initiatorId));
    return toView(requisition);
  }

  @Post(":id/approve")
  @RequirePermission("procurement:requisition:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL requisition (interim manual-trigger pattern — see RequisitionsService's doc comment)" })
  @ApiResponse({ status: 200, type: RequisitionResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RequisitionResponseDto> {
    return toView(await this.requisitionsService.onApprovalDecided(id, true, req.user?.sub ?? null));
  }

  @Post(":id/reject")
  @RequirePermission("procurement:requisition:decide")
  @ApiOperation({ summary: "Manually record REJECTED for a PENDING_APPROVAL requisition" })
  @ApiResponse({ status: 200, type: RequisitionResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RequisitionResponseDto> {
    return toView(await this.requisitionsService.onApprovalDecided(id, false, req.user?.sub ?? null));
  }

  @Post(":id/cancel")
  @RequirePermission("procurement:requisition:create")
  @ApiOperation({ summary: "Cancel a requisition (not yet CONVERTED/CANCELLED/REJECTED)" })
  @ApiResponse({ status: 200, type: RequisitionResponseDto })
  async cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<RequisitionResponseDto> {
    return toView(await this.requisitionsService.cancel(id, req.user?.sub ?? null));
  }
}
