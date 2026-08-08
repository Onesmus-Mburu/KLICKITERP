import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { SupplierInvoicesService } from "../application/supplier-invoices.service";
import { ProcSupplierInvoiceEntity, ProcSupplierInvoiceStatus } from "../domain/proc-supplier-invoice.entity";
import { CaptureSupplierInvoiceDto, ResolveMatchExceptionDto, SupplierInvoiceResponseDto } from "./dto/supplier-invoice.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcSupplierInvoiceEntity): SupplierInvoiceResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    supplierRef: entity.supplierRef,
    supplierId: entity.supplierId,
    poId: entity.poId,
    invoiceDate: entity.invoiceDate,
    dueDate: entity.dueDate,
    total: entity.total.toDecimalString(),
    status: entity.status,
    matchVariance: entity.matchVariance,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    paidAmount: entity.paidAmount.toDecimalString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`SupplierInvoicesController.${action}: no authenticated user on request`);
  return userId;
}

/** `proc_supplier_invoice`: capture, FR-PROC-007.1's 3-way match (+ exception resolution), and P-20 posting. */
@ApiTags("procurement-supplier-invoices")
@Controller("procurement/supplier-invoices")
export class SupplierInvoicesController {
  constructor(
    private readonly supplierInvoicesService: SupplierInvoicesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("procurement:supplier-invoice:manage")
  @ApiOperation({ summary: "Capture a supplier invoice (status starts UNMATCHED)" })
  @ApiResponse({ status: 201, type: SupplierInvoiceResponseDto })
  async capture(@Body() dto: CaptureSupplierInvoiceDto, @Req() req: AuthenticatedRequest): Promise<SupplierInvoiceResponseDto> {
    const captured = await runInTransaction(this.dataSource, (manager) =>
      this.supplierInvoicesService.capture(
        manager,
        {
          supplierId: dto.supplierId,
          poId: dto.poId ?? null,
          supplierRef: dto.supplierRef,
          invoiceDate: dto.invoiceDate,
          dueDate: dto.dueDate,
          total: Money.fromDecimalString(dto.total),
          lines: dto.lines?.map((line) => ({
            poLineId: line.poLineId,
            qty: line.qty,
            unitPrice: Money.fromDecimalString(line.unitPrice),
          })),
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(captured);
  }

  @Get()
  @RequirePermission("procurement:supplier-invoice:manage")
  @ApiOperation({ summary: "List supplier invoices, optionally filtered by status/supplier" })
  @ApiResponse({ status: 200, type: [SupplierInvoiceResponseDto] })
  async list(
    @Query("status") status?: ProcSupplierInvoiceStatus,
    @Query("supplierId") supplierId?: string,
  ): Promise<SupplierInvoiceResponseDto[]> {
    return (await this.supplierInvoicesService.list({ status, supplierId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:supplier-invoice:manage")
  @ApiOperation({ summary: "Get a supplier invoice by id" })
  @ApiResponse({ status: 200, type: SupplierInvoiceResponseDto })
  async findOne(@Param("id") id: string): Promise<SupplierInvoiceResponseDto> {
    return toView(await this.supplierInvoicesService.findByIdOrFail(id));
  }

  @Post(":id/match")
  @RequirePermission("procurement:supplier-invoice:match")
  @ApiOperation({ summary: "FR-PROC-007.1: 3-way match against the invoice's PO + POSTED GRNs (auto MATCHED/MATCH_EXCEPTION per Settings tolerances)" })
  @ApiResponse({ status: 200, type: SupplierInvoiceResponseDto })
  async match(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SupplierInvoiceResponseDto> {
    const matched = await runInTransaction(this.dataSource, (manager) =>
      this.supplierInvoicesService.matchAgainstPo(manager, id, req.user?.sub ?? null),
    );
    return toView(matched);
  }

  @Post(":id/resolve-exception")
  @RequirePermission("procurement:supplier-invoice:match")
  @ApiOperation({ summary: "Manually resolve a MATCH_EXCEPTION invoice: ACCEPT_VARIANCE -> MATCHED, REJECT -> UNMATCHED for correction" })
  @ApiResponse({ status: 200, type: SupplierInvoiceResponseDto })
  async resolveException(
    @Param("id") id: string,
    @Body() dto: ResolveMatchExceptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SupplierInvoiceResponseDto> {
    const resolved = await runInTransaction(this.dataSource, (manager) =>
      this.supplierInvoicesService.resolveMatchException(manager, id, dto.resolution, dto.note, req.user?.sub ?? null),
    );
    return toView(resolved);
  }

  @Post(":id/post")
  @RequirePermission("procurement:supplier-invoice:manage")
  @ApiOperation({ summary: "Post a MATCHED supplier invoice (realizes P-20)" })
  @ApiResponse({ status: 200, type: SupplierInvoiceResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SupplierInvoiceResponseDto> {
    const postedBy = requireUserId(req, "post");
    const posted = await runInTransaction(this.dataSource, (manager) => this.supplierInvoicesService.post(manager, id, postedBy));
    return toView(posted);
  }
}
