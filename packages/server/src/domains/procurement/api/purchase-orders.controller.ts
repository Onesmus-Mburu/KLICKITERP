import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { CreatePurchaseOrderFromRequisitionInput, PurchaseOrdersService } from "../application/purchase-orders.service";
import { ProcPurchaseOrderEntity, ProcPurchaseOrderStatus } from "../domain/proc-purchase-order.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import {
  CreatePurchaseOrderDto,
  PurchaseOrderLineResponseDto,
  PurchaseOrderResponseDto,
  RevisePurchaseOrderDto,
} from "./dto/purchase-order.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcPurchaseOrderEntity): PurchaseOrderResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    revision: entity.revision,
    supersedesId: entity.supersedesId,
    supplierId: entity.supplierId,
    requisitionId: entity.requisitionId,
    quotationId: entity.quotationId,
    status: entity.status,
    approvalRef: entity.approvalRef,
    orderDate: entity.orderDate,
    deliveryTerms: entity.deliveryTerms,
    paymentTermsDays: entity.paymentTermsDays,
    subtotal: entity.subtotal.toDecimalString(),
    taxAmount: entity.taxAmount.toDecimalString(),
    total: entity.total.toDecimalString(),
    issuedAt: entity.issuedAt,
  };
}

function toLineView(entity: ProcPoLineEntity): PurchaseOrderLineResponseDto {
  return {
    id: entity.id,
    poId: entity.poId,
    lineNo: entity.lineNo,
    itemId: entity.itemId,
    description: entity.description,
    qty: entity.qty,
    unitPrice: entity.unitPrice.toDecimalString(),
    receivedQty: entity.receivedQty,
  };
}

function toLineInputs(dto: CreatePurchaseOrderDto | RevisePurchaseOrderDto): CreatePurchaseOrderFromRequisitionInput["lines"] {
  return (dto.lines ?? []).map((line) => ({
    itemId: line.itemId ?? null,
    description: line.description,
    qty: line.qty,
    unitPrice: Money.fromDecimalString(line.unitPrice),
  }));
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`PurchaseOrdersController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * `proc_purchase_order` (+lines): create-from-requisition, direct-create
 * (BR-PROC-01's bypass escape hatch — see `create()`/`createDirect()`, gated
 * behind the SEPARATE `procurement:po:create-direct` permission per the task
 * brief), submit -> approve/reject -> issue, and revise. No dedicated
 * `...:view` permission code exists for this entity, so every GET here
 * reuses `procurement:po:create` (the base permission every PO-workflow
 * participant needs) — the same documented "no separate view code, reuse
 * the nearest one" judgement call `QuotationsController`/`GrnController`
 * make for their own entities.
 */
@ApiTags("procurement-purchase-orders")
@Controller("procurement/purchase-orders")
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("procurement:po:create")
  @ApiOperation({ summary: "Create a DRAFT PO from an APPROVED requisition (BR-PROC-01)" })
  @ApiResponse({ status: 201, type: PurchaseOrderResponseDto })
  async create(@Body() dto: CreatePurchaseOrderDto, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    const initiatorId = requireUserId(req, "create");
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.purchaseOrdersService.createFromRequisition(
        manager,
        {
          requisitionId: dto.requisitionId,
          quotationId: dto.quotationId ?? null,
          supplierId: dto.supplierId,
          orderDate: dto.orderDate,
          deliveryTerms: dto.deliveryTerms,
          lines: toLineInputs(dto),
          bypassRequisition: false,
        },
        initiatorId,
      ),
    );
    return toView(created);
  }

  @Post("direct")
  @RequirePermission("procurement:po:create-direct")
  @ApiOperation({ summary: "BR-PROC-01's direct-PO escape hatch — create a DRAFT PO with no requisition, gated behind a separate permission" })
  @ApiResponse({ status: 201, type: PurchaseOrderResponseDto })
  async createDirect(@Body() dto: CreatePurchaseOrderDto, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    const initiatorId = requireUserId(req, "createDirect");
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.purchaseOrdersService.createFromRequisition(
        manager,
        {
          requisitionId: dto.requisitionId ?? null,
          quotationId: dto.quotationId ?? null,
          supplierId: dto.supplierId,
          orderDate: dto.orderDate,
          deliveryTerms: dto.deliveryTerms,
          lines: toLineInputs(dto),
          bypassRequisition: true,
        },
        initiatorId,
      ),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:po:create")
  @ApiOperation({ summary: "List purchase orders, optionally filtered by status/supplier" })
  @ApiResponse({ status: 200, type: [PurchaseOrderResponseDto] })
  async list(
    @Query("status") status?: ProcPurchaseOrderStatus,
    @Query("supplierId") supplierId?: string,
  ): Promise<PurchaseOrderResponseDto[]> {
    return (await this.purchaseOrdersService.list({ status, supplierId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:po:create")
  @ApiOperation({ summary: "Get a purchase order by id" })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async findOne(@Param("id") id: string): Promise<PurchaseOrderResponseDto> {
    return toView(await this.purchaseOrdersService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("procurement:po:create")
  @ApiOperation({ summary: "List a purchase order's lines" })
  @ApiResponse({ status: 200, type: [PurchaseOrderLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<PurchaseOrderLineResponseDto[]> {
    return (await this.purchaseOrdersService.listLines(id)).map(toLineView);
  }

  @Post(":id/submit")
  @RequirePermission("procurement:po:submit")
  @ApiOperation({ summary: "Submit a DRAFT PO for approval" })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const po = await runInTransaction(this.dataSource, (manager) => this.purchaseOrdersService.submitForApproval(manager, id, initiatorId));
    return toView(po);
  }

  @Post(":id/approve")
  @RequirePermission("procurement:po:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL PO (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    return toView(await this.purchaseOrdersService.onApprovalDecided(id, true, req.user?.sub ?? null));
  }

  @Post(":id/reject")
  @RequirePermission("procurement:po:decide")
  @ApiOperation({ summary: "Manually record REJECTED for a PENDING_APPROVAL PO (returns it to DRAFT)" })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    return toView(await this.purchaseOrdersService.onApprovalDecided(id, false, req.user?.sub ?? null));
  }

  @Post(":id/issue")
  @RequirePermission("procurement:po:issue")
  @ApiOperation({ summary: "Issue an APPROVED PO (the trg_proc_po_immutable freeze point); for a revision, cancels the superseded original in the same transaction" })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async issue(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    const po = await runInTransaction(this.dataSource, (manager) => this.purchaseOrdersService.issue(manager, id, req.user?.sub ?? null));
    return toView(po);
  }

  @Post(":id/revise")
  @RequirePermission("procurement:po:create")
  @ApiOperation({ summary: "Create a new DRAFT PO superseding this one (FR-PROC-004.1) — only legal once the original is ISSUED/PARTIALLY_RECEIVED" })
  @ApiResponse({ status: 201, type: PurchaseOrderResponseDto })
  async revise(@Param("id") id: string, @Body() dto: RevisePurchaseOrderDto, @Req() req: AuthenticatedRequest): Promise<PurchaseOrderResponseDto> {
    const initiatorId = requireUserId(req, "revise");
    const revised = await runInTransaction(this.dataSource, (manager) =>
      this.purchaseOrdersService.revise(
        manager,
        id,
        {
          supplierId: dto.supplierId,
          deliveryTerms: dto.deliveryTerms,
          lines: dto.lines ? toLineInputs(dto) : undefined,
        },
        initiatorId,
      ),
    );
    return toView(revised);
  }
}
