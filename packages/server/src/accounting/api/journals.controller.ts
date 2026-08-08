import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../shared/database/tx";
import { Money } from "../../shared/money/money";
import { GlJournalWithLines, PostingService } from "../application/posting.service";
import { GlJournalRepository } from "../infrastructure/gl-journal.repository";
import { GlJournalLineRepository } from "../infrastructure/gl-journal-line.repository";
import { JournalResponseDto } from "./dto/journal-response.dto";
import { PostJournalDto } from "./dto/post-journal.dto";
import { ReverseJournalDto } from "./dto/reverse-journal.dto";
import { AuthenticatedRequest } from "./request-context";

function toJournalView(journal: GlJournalWithLines): JournalResponseDto {
  return {
    ...journal,
    lines: journal.lines.map((line) => ({
      ...line,
      debit: line.debit.toDecimalString(),
      credit: line.credit.toDecimalString(),
    })),
  } as unknown as JournalResponseDto;
}

/**
 * `POST /accounting/journals` is the ONLY public HTTP path into
 * `PostingService.post()` — genuine MANUAL journal entries typed by a
 * finance user. Every other journal (billing, payments, payroll, ...)
 * is posted by its own domain service calling `PostingService.post()`
 * directly inside its own transaction, never through this controller.
 * `journalType` is always forced to `'MANUAL'` server-side — the incoming
 * DTO doesn't even accept a `journalType` field (see `PostJournalDto`'s
 * doc comment), so there is nothing for a client to override.
 */
@ApiTags("accounting-journals")
@Controller("accounting/journals")
export class JournalsController {
  constructor(
    private readonly postingService: PostingService,
    private readonly journalRepository: GlJournalRepository,
    private readonly journalLineRepository: GlJournalLineRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("accounting:journal:post")
  @ApiOperation({ summary: "Post a MANUAL journal entry (journalType is always forced to MANUAL server-side)" })
  @ApiResponse({ status: 201, type: JournalResponseDto })
  async post(@Body() dto: PostJournalDto, @Req() req: AuthenticatedRequest): Promise<JournalResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) {
      throw new Error("JournalsController.post: no authenticated user on request");
    }
    const journal = await runInTransaction(this.dataSource, (manager) =>
      this.postingService.post(manager, {
        journalDate: dto.journalDate,
        sourceModule: dto.sourceModule,
        sourceDocType: dto.sourceDocType,
        sourceDocId: dto.sourceDocId,
        narration: dto.narration,
        journalType: "MANUAL",
        periodId: dto.periodId,
        postedBy,
        lines: dto.lines.map((line) => ({
          accountId: line.accountId,
          costCenterId: line.costCenterId ?? null,
          debit: Money.fromDecimalString(line.debit),
          credit: Money.fromDecimalString(line.credit),
          memo: line.memo ?? null,
          entityRefType: line.entityRefType ?? null,
          entityRefId: line.entityRefId ?? null,
        })),
      }),
    );
    return toJournalView(journal);
  }

  @Post(":id/reverse")
  @RequirePermission("accounting:journal:post")
  @ApiOperation({ summary: "Post a REVERSING journal for an existing one, with every line's debit/credit swapped" })
  @ApiResponse({ status: 201, type: JournalResponseDto })
  async reverse(
    @Param("id") id: string,
    @Body() dto: ReverseJournalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<JournalResponseDto> {
    const postedBy = req.user?.sub;
    if (!postedBy) {
      throw new Error("JournalsController.reverse: no authenticated user on request");
    }
    const journal = await runInTransaction(this.dataSource, (manager) =>
      this.postingService.reverse(manager, id, dto.narration, postedBy),
    );
    return toJournalView(journal);
  }

  @Get()
  @RequirePermission("accounting:journal:view")
  @ApiOperation({ summary: "List journals, filterable by source module/doc type/doc id, period, and date range" })
  @ApiResponse({ status: 200, type: [JournalResponseDto] })
  async list(
    @Query("sourceModule") sourceModule?: string,
    @Query("sourceDocType") sourceDocType?: string,
    @Query("sourceDocId") sourceDocId?: string,
    @Query("periodId") periodId?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ): Promise<JournalResponseDto[]> {
    const journals = await this.journalRepository.list({
      sourceModule,
      sourceDocType,
      sourceDocId,
      periodId,
      fromDate,
      toDate,
    });
    return journals.map((journal) => toJournalView(Object.assign(journal, { lines: [] })));
  }

  @Get(":id")
  @RequirePermission("accounting:journal:view")
  @ApiOperation({ summary: "Get a journal with its lines" })
  @ApiResponse({ status: 200, type: JournalResponseDto })
  async findOne(@Param("id") id: string): Promise<JournalResponseDto> {
    const journal = await this.journalRepository.findByIdOrFail(id);
    const lines = await this.journalLineRepository.listByJournal(id);
    return toJournalView(Object.assign(journal, { lines }));
  }
}
