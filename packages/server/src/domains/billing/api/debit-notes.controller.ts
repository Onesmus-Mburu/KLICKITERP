import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { DebitNotesService } from "../application/debit-notes.service";
import { BillDebitNoteEntity } from "../domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "../domain/bill-debit-note-line.entity";
import { CreateDebitNoteDto, DebitNoteLineResponseDto, DebitNoteResponseDto } from "./dto/debit-note.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillDebitNoteEntity): DebitNoteResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    studentId: entity.studentId,
    termId: entity.termId,
    invoiceId: entity.invoiceId,
    reason: entity.reason,
    status: entity.status,
    journalId: entity.journalId,
    total: entity.total.toDecimalString(),
  };
}

function toLineView(entity: BillDebitNoteLineEntity): DebitNoteLineResponseDto {
  return {
    id: entity.id,
    debitNoteId: entity.debitNoteId,
    lineNo: entity.lineNo,
    feeCategoryId: entity.feeCategoryId,
    description: entity.description,
    amount: entity.amount.toDecimalString(),
  };
}

/** `bill_debit_note` — new charges against a student, realized as P-07 through `InvoicingService` at `post()` time (see `DebitNotesService`'s doc comment for the design decision). No approval workflow in this pass (see that service's doc comment). */
@ApiTags("billing-debit-notes")
@Controller("billing/debit-notes")
export class DebitNotesController {
  constructor(
    private readonly service: DebitNotesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("billing:debit-note:manage")
  @ApiOperation({ summary: "Create a DRAFT debit note (new charges against a student)" })
  @ApiResponse({ status: 201, type: DebitNoteResponseDto })
  async create(@Body() dto: CreateDebitNoteDto, @Req() req: AuthenticatedRequest): Promise<DebitNoteResponseDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("DebitNotesController.create: no authenticated user on request");
    return toView(
      await this.service.create(
        {
          studentId: dto.studentId,
          termId: dto.termId,
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
  @RequirePermission("billing:debit-note:view")
  @ApiOperation({ summary: "List debit notes for a student" })
  @ApiResponse({ status: 200, type: [DebitNoteResponseDto] })
  async list(@Query("studentId") studentId: string): Promise<DebitNoteResponseDto[]> {
    return (await this.service.listByStudent(studentId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:debit-note:view")
  @ApiOperation({ summary: "Get a debit note by id" })
  @ApiResponse({ status: 200, type: DebitNoteResponseDto })
  async findOne(@Param("id") id: string): Promise<DebitNoteResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Get(":id/lines")
  @RequirePermission("billing:debit-note:view")
  @ApiOperation({ summary: "List a debit note's lines" })
  @ApiResponse({ status: 200, type: [DebitNoteLineResponseDto] })
  async listLines(@Param("id") id: string): Promise<DebitNoteLineResponseDto[]> {
    return (await this.service.listLines(id)).map(toLineView);
  }

  @Post(":id/post")
  @RequirePermission("billing:debit-note:manage")
  @ApiOperation({ summary: "Post a DRAFT debit note (realizes P-07 via InvoicingService)" })
  @ApiResponse({ status: 200, type: DebitNoteResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<DebitNoteResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) throw new Error("DebitNotesController.post: no authenticated user on request");
    const note = await runInTransaction(this.dataSource, (manager) => this.service.post(manager, id, postedBy));
    return toView(note);
  }
}
