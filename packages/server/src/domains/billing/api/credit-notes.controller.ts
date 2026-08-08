import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { CreditNotesService } from "../application/credit-notes.service";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "../domain/bill-credit-note-line.entity";
import {
  CreateCreditNoteDto,
  CreditNoteLineResponseDto,
  CreditNoteResponseDto,
  DecideCreditNoteDto,
} from "./dto/credit-note.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillCreditNoteEntity): CreditNoteResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    invoiceId: entity.invoiceId,
    reason: entity.reason,
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    total: entity.total.toDecimalString(),
  };
}

function toLineView(entity: BillCreditNoteLineEntity): CreditNoteLineResponseDto {
  return {
    id: entity.id,
    creditNoteId: entity.creditNoteId,
    lineNo: entity.lineNo,
    feeCategoryId: entity.feeCategoryId,
    description: entity.description,
    amount: entity.amount.toDecimalString(),
  };
}

/** `bill_credit_note` — BR-BILL-09's correction path for a POSTED invoice with payment applied (P-06). */
@ApiTags("billing-credit-notes")
@Controller("billing/credit-notes")
export class CreditNotesController {
  constructor(
    private readonly service: CreditNotesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("billing:credit-note:manage")
  @ApiOperation({ summary: "Create a DRAFT credit note against a POSTED invoice" })
  @ApiResponse({ status: 201, type: CreditNoteResponseDto })
  async create(@Body() dto: CreateCreditNoteDto, @Req() req: AuthenticatedRequest): Promise<CreditNoteResponseDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("CreditNotesController.create: no authenticated user on request");
    return toView(
      await this.service.create(
        {
          invoiceId: dto.invoiceId,
          reason: dto.reason,
          lines: dto.lines.map((line) => ({
            feeCategoryId: line.feeCategoryId,
            description: line.description,
            amount: Money.fromDecimalString(line.amount),
          })),
        },
        initiatedBy,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:credit-note:view")
  @ApiOperation({ summary: "List credit notes for an invoice" })
  @ApiResponse({ status: 200, type: [CreditNoteResponseDto] })
  async listByInvoice(@Query("invoiceId") invoiceId: string): Promise<CreditNoteResponseDto[]> {
    return (await this.service.listByInvoice(invoiceId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:credit-note:view")
  @ApiOperation({ summary: "Get a credit note by id" })
  @ApiResponse({ status: 200, type: CreditNoteResponseDto })
  async findOne(@Param("id") id: string): Promise<CreditNoteResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("billing:credit-note:view")
  @ApiOperation({ summary: "List a credit note's lines" })
  @ApiResponse({ status: 200, type: [CreditNoteLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<CreditNoteLineResponseDto[]> {
    return (await this.service.listLines(id)).map(toLineView);
  }

  @Post(":id/submit")
  @RequirePermission("billing:credit-note:manage")
  @ApiOperation({ summary: "Submit a DRAFT credit note for approval (domainCode BILLING_CREDIT_NOTE)" })
  @ApiResponse({ status: 200, type: CreditNoteResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<CreditNoteResponseDto> {
    const initiatorId = req.user?.sub;
    if (!initiatorId) throw new Error("CreditNotesController.submit: no authenticated user on request");
    return toView(await this.service.submitForApproval(id, initiatorId));
  }

  @Post(":id/decide")
  @RequirePermission("billing:credit-note:manage")
  @ApiOperation({ summary: "Approve/reject a PENDING_APPROVAL credit note (interim manual trigger)" })
  @ApiResponse({ status: 200, type: CreditNoteResponseDto })
  async decide(
    @Param("id") id: string,
    @Body() dto: DecideCreditNoteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreditNoteResponseDto> {
    return toView(await this.service.onApprovalDecided(id, dto.approved, req.user?.sub ?? null));
  }

  @Post(":id/post")
  @RequirePermission("billing:credit-note:manage")
  @ApiOperation({ summary: "Post an APPROVED credit note (realizes P-06)" })
  @ApiResponse({ status: 200, type: CreditNoteResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<CreditNoteResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) throw new Error("CreditNotesController.post: no authenticated user on request");
    const note = await runInTransaction(this.dataSource, (manager) => this.service.post(manager, id, postedBy));
    return toView(note);
  }
}
