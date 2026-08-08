import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { ChequeBooksService } from "../application/cheque-books.service";
import { BankChequeBookEntity } from "../domain/bank-cheque-book.entity";
import { BankChequeBookResponseDto, CreateChequeBookDto } from "./dto/cheque-book.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankChequeBookEntity): BankChequeBookResponseDto {
  return {
    id: entity.id,
    accountId: entity.accountId,
    prefix: entity.prefix,
    startLeaf: entity.startLeaf,
    endLeaf: entity.endLeaf,
  };
}

/** FR-BANK-005.1 — cheque book registration, auto-generates its `bank_cheque_leaf` range. */
@ApiTags("banking-cheque-books")
@Controller("banking/cheque-books")
export class ChequeBooksController {
  constructor(
    private readonly chequeBooksService: ChequeBooksService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:cheque-book:manage")
  @ApiOperation({ summary: "Register a cheque book (auto-generates one UNUSED bank_cheque_leaf per leaf in the range)" })
  @ApiResponse({ status: 201, type: BankChequeBookResponseDto })
  async create(@Body() dto: CreateChequeBookDto, @Req() req: AuthenticatedRequest): Promise<BankChequeBookResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.chequeBooksService.create(manager, dto, req.user?.sub ?? null),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("banking:cheque-book:manage")
  @ApiOperation({ summary: "List cheque books, optionally filtered by accountId" })
  @ApiResponse({ status: 200, type: [BankChequeBookResponseDto] })
  async list(@Query("accountId") accountId?: string): Promise<BankChequeBookResponseDto[]> {
    return (await this.chequeBooksService.list({ accountId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:cheque-book:manage")
  @ApiOperation({ summary: "Get a cheque book by id" })
  @ApiResponse({ status: 200, type: BankChequeBookResponseDto })
  async findOne(@Param("id") id: string): Promise<BankChequeBookResponseDto> {
    return toView(await this.chequeBooksService.findByIdOrFail(id));
  }
}
