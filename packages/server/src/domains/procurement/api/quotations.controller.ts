import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { QuotationsService } from "../application/quotations.service";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";
import { ProcQuotationLineEntity } from "../domain/proc-quotation-line.entity";
import { AwardQuotationDto, CreateQuotationDto, QuotationLineResponseDto, QuotationResponseDto } from "./dto/quotation.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ProcQuotationEntity): QuotationResponseDto {
  return {
    id: entity.id,
    requisitionId: entity.requisitionId,
    supplierId: entity.supplierId,
    quoteDate: entity.quoteDate,
    validUntil: entity.validUntil,
    documentFileId: entity.documentFileId,
    total: entity.total.toDecimalString(),
    terms: entity.terms,
    isAwarded: entity.isAwarded,
    awardReason: entity.awardReason,
  };
}

function toLineView(entity: ProcQuotationLineEntity): QuotationLineResponseDto {
  return {
    id: entity.id,
    quotationId: entity.quotationId,
    itemId: entity.itemId,
    description: entity.description,
    qty: entity.qty,
    unitPrice: entity.unitPrice.toDecimalString(),
  };
}

/**
 * `proc_quotation` (+lines) capture and `award()`. No dedicated `...:view`
 * permission code exists for this entity (`procurement:quotation:manage`
 * bundles create/view/award, the same "manage-bundles-view" shape
 * `payments:cheque:manage`/`payments:suspense:manage` already established
 * elsewhere in this codebase) — every endpoint here, including the GETs,
 * uses `procurement:quotation:manage`.
 */
@ApiTags("procurement-quotations")
@Controller("procurement/quotations")
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("procurement:quotation:manage")
  @ApiOperation({ summary: "Capture a quotation + its lines atomically against an APPROVED requisition" })
  @ApiResponse({ status: 201, type: QuotationResponseDto })
  async create(@Body() dto: CreateQuotationDto, @Req() req: AuthenticatedRequest): Promise<QuotationResponseDto> {
    const created = await this.quotationsService.create(
      {
        requisitionId: dto.requisitionId,
        supplierId: dto.supplierId,
        quoteDate: dto.quoteDate,
        validUntil: dto.validUntil ?? null,
        documentFileId: dto.documentFileId ?? null,
        terms: dto.terms ?? null,
        lines: dto.lines.map((line) => ({
          itemId: line.itemId ?? null,
          description: line.description,
          qty: line.qty,
          unitPrice: Money.fromDecimalString(line.unitPrice),
        })),
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("procurement:quotation:manage")
  @ApiOperation({ summary: "List quotations for a requisition" })
  @ApiResponse({ status: 200, type: [QuotationResponseDto] })
  async list(@Query("requisitionId") requisitionId: string): Promise<QuotationResponseDto[]> {
    return (await this.quotationsService.listByRequisition(requisitionId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("procurement:quotation:manage")
  @ApiOperation({ summary: "Get a quotation by id" })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async findOne(@Param("id") id: string): Promise<QuotationResponseDto> {
    return toView(await this.quotationsService.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("procurement:quotation:manage")
  @ApiOperation({ summary: "List a quotation's lines" })
  @ApiResponse({ status: 200, type: [QuotationLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<QuotationLineResponseDto[]> {
    return (await this.quotationsService.listLines(id)).map(toLineView);
  }

  @Post(":id/award")
  @RequirePermission("procurement:quotation:manage")
  @ApiOperation({ summary: "Award this quotation (uq_proc_quotation_award_p: at most one awarded quotation per requisition)" })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async award(@Param("id") id: string, @Body() dto: AwardQuotationDto, @Req() req: AuthenticatedRequest): Promise<QuotationResponseDto> {
    const awarded = await runInTransaction(this.dataSource, (manager) =>
      this.quotationsService.award(manager, id, dto.awardReason, req.user?.sub ?? null),
    );
    return toView(awarded);
  }
}
