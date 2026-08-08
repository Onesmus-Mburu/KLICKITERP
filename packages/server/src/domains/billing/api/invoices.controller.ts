import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { PaginationQueryDto } from "../../../shared/pagination/pagination.dto";
import { InvoicingService } from "../application/invoicing.service";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import {
  GenerateInvoiceDto,
  InvoiceLineResponseDto,
  InvoiceResponseDto,
  PendingUpcomingInvoiceListResponseDto,
  PendingUpcomingInvoiceResponseDto,
  VoidInvoiceDto,
} from "./dto/invoice.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillInvoiceEntity): InvoiceResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    studentId: entity.studentId,
    termId: entity.termId,
    feeStructureId: entity.feeStructureId,
    issueDate: entity.issueDate,
    dueDate: entity.dueDate,
    status: entity.status,
    source: entity.source,
    subtotal: entity.subtotal.toDecimalString(),
    concessionTotal: entity.concessionTotal.toDecimalString(),
    total: entity.total.toDecimalString(),
    paidAmount: entity.paidAmount.toDecimalString(),
    balance: entity.balance.toDecimalString(),
    journalId: entity.journalId,
  };
}

function toLineView(entity: BillInvoiceLineEntity): InvoiceLineResponseDto {
  return {
    id: entity.id,
    invoiceId: entity.invoiceId,
    lineNo: entity.lineNo,
    feeCategoryId: entity.feeCategoryId,
    description: entity.description,
    amount: entity.amount.toDecimalString(),
    concessionAmount: entity.concessionAmount.toDecimalString(),
  };
}

/** Phase 6 Slice 8 (Part 2) — `pending()`/`upcoming()`'s row shape; `entity.student` is populated by `BillInvoiceRepository.findOpenPaginated()`'s `leftJoinAndSelect("invoice.student", "student")`. */
function toPendingUpcomingView(entity: BillInvoiceEntity): PendingUpcomingInvoiceResponseDto {
  const student = entity.student;
  return {
    id: entity.id,
    number: entity.number,
    dueDate: entity.dueDate,
    total: entity.total.toDecimalString(),
    balance: entity.balance.toDecimalString(),
    status: entity.status,
    studentId: entity.studentId,
    admissionNo: student?.admissionNo ?? "",
    studentName: student ? `${student.firstName}${student.middleName ? ` ${student.middleName}` : ""} ${student.lastName}` : "",
    classId: student?.classId ?? "",
  };
}

/** Same `new Date().toISOString().slice(0, 10)` default-today convention as `aging-outstanding.report.ts`/`schedules.controller.ts`/`recurring.controller.ts`. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `bill_invoice` — THE core billing document. `generate`/`post`/`void` each open their own transaction here (mirrors `JournalsController`'s pattern) since `InvoicingService`'s methods take the caller's own `EntityManager`. */
@ApiTags("billing-invoices")
@Controller("billing/invoices")
export class InvoicesController {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly invoiceLineRepository: BillInvoiceLineRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("generate")
  @RequirePermission("billing:invoice:generate")
  @ApiOperation({ summary: "Generate a DRAFT invoice (STRUCTURE/ADHOC/RECURRING/DEBIT_NOTE)" })
  @ApiResponse({ status: 201, type: InvoiceResponseDto })
  async generate(@Body() dto: GenerateInvoiceDto, @Req() req: AuthenticatedRequest): Promise<InvoiceResponseDto> {
    const invoice = await runInTransaction(this.dataSource, (manager) =>
      this.invoicingService.generateInvoice(manager, {
        studentId: dto.studentId,
        termId: dto.termId,
        source: dto.source,
        adhocLines: dto.adhocLines?.map((line) => ({
          feeCategoryId: line.feeCategoryId,
          description: line.description,
          amount: Money.fromDecimalString(line.amount),
        })),
        issueDate: dto.issueDate,
        dueDate: dto.dueDate,
        createdBy: req.user?.sub ?? null,
      }),
    );
    return toView(invoice);
  }

  @Post(":id/post")
  @RequirePermission("billing:invoice:post")
  @ApiOperation({ summary: "Post a DRAFT invoice (realizes P-01..P-04)" })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<InvoiceResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) throw new Error("InvoicesController.post: no authenticated user on request");
    const invoice = await runInTransaction(this.dataSource, (manager) => this.invoicingService.postInvoice(manager, id, postedBy));
    return toView(invoice);
  }

  @Post(":id/void")
  @RequirePermission("billing:invoice:void")
  @ApiOperation({ summary: "Void a POSTED invoice with no payment applied (BR-BILL-09; else use a credit note)" })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  async voidInvoice(
    @Param("id") id: string,
    @Body() dto: VoidInvoiceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InvoiceResponseDto> {
    const voidedBy = req.user?.sub;
    if (!voidedBy) throw new Error("InvoicesController.voidInvoice: no authenticated user on request");
    const invoice = await runInTransaction(this.dataSource, (manager) =>
      this.invoicingService.voidInvoice(manager, id, dto.reason, voidedBy),
    );
    return toView(invoice);
  }

  @Get()
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "List invoices for a student" })
  @ApiResponse({ status: 200, type: [InvoiceResponseDto] })
  async list(@Query("studentId") studentId: string): Promise<InvoiceResponseDto[]> {
    return (await this.invoiceRepository.listByStudent(studentId)).map(toView);
  }

  /**
   * Phase 6 Slice 8 (Part 2) — the Pending invoices list screen:
   * `balance>0 AND status<>'VOID' AND due_date < asOfDate` (default today),
   * paginated, joined to student. Declared BEFORE `:id` deliberately (same
   * reasoning `FeeStructuresController`'s `categories-for-scope` endpoint
   * already documents) — Nest/Express matches routes in declaration order,
   * and `:id` would otherwise swallow the literal `pending` segment as an id
   * value.
   */
  @Get("pending")
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "List open invoices (balance>0, non-VOID) with due_date < asOfDate (default today), paginated, joined to student" })
  @ApiQuery({ name: "q", required: false, description: "Phase 6 Slice 9 — ILIKE match against the joined student's name or admission number" })
  @ApiResponse({ status: 200, type: PendingUpcomingInvoiceListResponseDto })
  async pending(
    @Query() pagination: PaginationQueryDto,
    @Query("asOfDate") asOfDate?: string,
    @Query("q") q?: string,
  ): Promise<PendingUpcomingInvoiceListResponseDto> {
    const { items, total } = await this.invoiceRepository.findOpenPaginated(
      "PENDING",
      asOfDate ?? todayIsoDate(),
      { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize },
      q,
    );
    return { items: items.map(toPendingUpcomingView), total };
  }

  /** Phase 6 Slice 8 (Part 2) — the Upcoming invoices list screen: same shape as `pending()` above, `due_date >= asOfDate` instead. Also declared before `:id` for the same route-ordering reason. */
  @Get("upcoming")
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "List open invoices (balance>0, non-VOID) with due_date >= asOfDate (default today), paginated, joined to student" })
  @ApiQuery({ name: "q", required: false, description: "Phase 6 Slice 9 — ILIKE match against the joined student's name or admission number" })
  @ApiResponse({ status: 200, type: PendingUpcomingInvoiceListResponseDto })
  async upcoming(
    @Query() pagination: PaginationQueryDto,
    @Query("asOfDate") asOfDate?: string,
    @Query("q") q?: string,
  ): Promise<PendingUpcomingInvoiceListResponseDto> {
    const { items, total } = await this.invoiceRepository.findOpenPaginated(
      "UPCOMING",
      asOfDate ?? todayIsoDate(),
      { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize },
      q,
    );
    return { items: items.map(toPendingUpcomingView), total };
  }

  @Get(":id")
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "Get an invoice by id" })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  async findOne(@Param("id") id: string): Promise<InvoiceResponseDto> {
    return toView(await this.invoiceRepository.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "List an invoice's lines" })
  @ApiResponse({ status: 200, type: [InvoiceLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<InvoiceLineResponseDto[]> {
    return (await this.invoiceLineRepository.listByInvoice(id)).map(toLineView);
  }
}
