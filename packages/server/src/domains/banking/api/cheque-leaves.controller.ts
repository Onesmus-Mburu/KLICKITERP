import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { ChequeLeavesService } from "../application/cheque-leaves.service";
import { BankChequeLeafEntity, BankChequeLeafStatus } from "../domain/bank-cheque-leaf.entity";
import { BankChequeLeafResponseDto, IssueChequeLeafDto, ReasonDto } from "./dto/cheque-leaf.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankChequeLeafEntity): BankChequeLeafResponseDto {
  return {
    id: entity.id,
    bookId: entity.bookId,
    leafNo: entity.leafNo,
    status: entity.status,
    voucherId: entity.voucherId,
    payee: entity.payee,
    amount: entity.amount ? entity.amount.toDecimalString() : null,
    issuedOn: entity.issuedOn,
    statusReason: entity.statusReason,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ChequeLeavesController.${action}: no authenticated user on request`);
  return userId;
}

/** FR-BANK-005.1 — the cheque register: issue-next, mark-presented/cleared, stop, cancel, flag-stale (BR-BANK-04). */
@ApiTags("banking-cheque-leaves")
@Controller("banking/cheque-leaves")
export class ChequeLeavesController {
  constructor(
    private readonly chequeLeavesService: ChequeLeavesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "List cheque leaves, optionally filtered by bookId/status" })
  @ApiResponse({ status: 200, type: [BankChequeLeafResponseDto] })
  async list(
    @Query("bookId") bookId?: string,
    @Query("status") status?: BankChequeLeafStatus,
  ): Promise<BankChequeLeafResponseDto[]> {
    return (await this.chequeLeavesService.list({ bookId, status })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "Get a cheque leaf by id" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async findOne(@Param("id") id: string): Promise<BankChequeLeafResponseDto> {
    return toView(await this.chequeLeavesService.findByIdOrFail(id));
  }

  @Post("issue")
  @RequirePermission("banking:cheque-leaf:issue")
  @ApiOperation({ summary: "BR-BANK-04 — auto-issue the next sequential UNUSED leaf in the book" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async issueNext(@Body() dto: IssueChequeLeafDto, @Req() req: AuthenticatedRequest): Promise<BankChequeLeafResponseDto> {
    const issuedBy = requireUserId(req, "issueNext");
    const leaf = await runInTransaction(this.dataSource, (manager) =>
      this.chequeLeavesService.issueNext(
        manager,
        { bookId: dto.bookId, voucherId: dto.voucherId ?? null, payee: dto.payee, amount: Money.fromDecimalString(dto.amount) },
        issuedBy,
      ),
    );
    return toView(leaf);
  }

  @Post(":id/mark-presented")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "ISSUED -> PRESENTED" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async markPresented(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankChequeLeafResponseDto> {
    const actorId = requireUserId(req, "markPresented");
    return toView(await this.chequeLeavesService.markPresented(id, actorId));
  }

  @Post(":id/mark-cleared")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "PRESENTED -> CLEARED" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async markCleared(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankChequeLeafResponseDto> {
    const actorId = requireUserId(req, "markCleared");
    return toView(await this.chequeLeavesService.markCleared(id, actorId));
  }

  @Post(":id/stop")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "ISSUED/PRESENTED -> STOPPED, with a required reason" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async stop(@Param("id") id: string, @Body() dto: ReasonDto, @Req() req: AuthenticatedRequest): Promise<BankChequeLeafResponseDto> {
    const actorId = requireUserId(req, "stop");
    return toView(await this.chequeLeavesService.markStopped(id, dto.reason, actorId));
  }

  @Post(":id/cancel")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "BR-BANK-04's explicit-skip path — UNUSED/ISSUED -> CANCELLED, with a required reason" })
  @ApiResponse({ status: 200, type: BankChequeLeafResponseDto })
  async cancel(@Param("id") id: string, @Body() dto: ReasonDto, @Req() req: AuthenticatedRequest): Promise<BankChequeLeafResponseDto> {
    const actorId = requireUserId(req, "cancel");
    return toView(await this.chequeLeavesService.cancel(id, dto.reason, actorId));
  }

  @Post("flag-stale")
  @RequirePermission("banking:cheque-leaf:manage")
  @ApiOperation({ summary: "Manual-trigger (no scheduler exists) — flips ISSUED leaves older than 6 months to STALE" })
  @ApiResponse({ status: 200, type: [BankChequeLeafResponseDto] })
  async flagStale(): Promise<BankChequeLeafResponseDto[]> {
    return (await this.chequeLeavesService.flagStale()).map(toView);
  }
}
