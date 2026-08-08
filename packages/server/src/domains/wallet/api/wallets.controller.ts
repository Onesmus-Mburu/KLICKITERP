import { Controller, Body, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { PaginationQueryDto } from "../../../shared/pagination/pagination.dto";
import { WalletsService } from "../application/wallets.service";
import { WallWalletEntity } from "../domain/wall-wallet.entity";
import { WallWalletRepository } from "../infrastructure/wall-wallet.repository";
import { SetWalletStatusDto, UpdateWalletLimitsDto, WalletListItemResponseDto, WalletListResponseDto, WalletResponseDto } from "./dto/wallet.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: WallWalletEntity): WalletResponseDto {
  return {
    id: entity.id,
    studentId: entity.studentId,
    status: entity.status,
    balance: entity.balance.toDecimalString(),
    overdraftLimit: entity.overdraftLimit.toDecimalString(),
    dailyLimit: entity.dailyLimit ? entity.dailyLimit.toDecimalString() : null,
    txnLimit: entity.txnLimit ? entity.txnLimit.toDecimalString() : null,
    categoryBlocks: entity.categoryBlocks,
    statusReason: entity.statusReason,
  };
}

/** Phase 6 Slice 11 (Part 2) — `list()`'s row shape; `entity.student` is populated by `WallWalletRepository.findAllPaginated()`'s `leftJoinAndSelect("wallet.student", "student")`. */
function toListItemView(entity: WallWalletEntity): WalletListItemResponseDto {
  const student = entity.student;
  return {
    id: entity.id,
    studentId: entity.studentId,
    admissionNo: student?.admissionNo ?? "",
    studentName: student ? `${student.firstName}${student.middleName ? ` ${student.middleName}` : ""} ${student.lastName}` : "",
    status: entity.status,
    balance: entity.balance.toDecimalString(),
    overdraftLimit: entity.overdraftLimit.toDecimalString(),
    dailyLimit: entity.dailyLimit ? entity.dailyLimit.toDecimalString() : null,
    txnLimit: entity.txnLimit ? entity.txnLimit.toDecimalString() : null,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`WalletsController.${action}: no authenticated user on request`);
  return userId;
}

/** `wall_wallet` lifecycle — lazy provisioning (FR-WALL-004.1), status transitions (BR-WALL-03), limits (BR-WALL-04). */
@ApiTags("wallet-wallets")
@Controller("wallets")
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly walletRepository: WallWalletRepository,
  ) {}

  @Post("students/:studentId")
  @RequirePermission("wallet:wallet:manage")
  @ApiOperation({ summary: "Get or lazily create a student's wallet (ACTIVE/balance=0 on first use)" })
  @ApiResponse({ status: 201, type: WalletResponseDto })
  async getOrCreate(@Param("studentId") studentId: string, @Req() req: AuthenticatedRequest): Promise<WalletResponseDto> {
    const actorId = requireUserId(req, "getOrCreate");
    return toView(await this.walletsService.getOrCreateWallet(studentId, actorId));
  }

  /**
   * Phase 6 Slice 11 (Part 2) — the new Wallets list screen: every
   * `wall_wallet` row, paginated, joined to student, optionally ILIKE-
   * filtered by the joined student's name/admission number. Mirrors
   * `InvoicesController.pending()`/`.upcoming()` (Slice 8 Part 2)'s exact
   * `@Query() pagination: PaginationQueryDto` + optional `q` shape. Declared
   * BEFORE `:id`/`students/:studentId` only as a stylistic convention
   * matching that precedent — `GET /wallets` (no path segment) can't
   * actually collide with either route, both of which require at least one
   * more segment.
   */
  @Get()
  @RequirePermission("wallet:wallet:view")
  @ApiOperation({ summary: "List every wallet, paginated, joined to student, optionally filtered by student name/admission number" })
  @ApiQuery({ name: "q", required: false, description: "ILIKE match against the joined student's name or admission number" })
  @ApiResponse({ status: 200, type: WalletListResponseDto })
  async list(@Query() pagination: PaginationQueryDto, @Query("q") q?: string): Promise<WalletListResponseDto> {
    const { items, total } = await this.walletRepository.findAllPaginated(
      { q },
      { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize },
    );
    return { items: items.map(toListItemView), total };
  }

  @Get("students/:studentId")
  @RequirePermission("wallet:wallet:view")
  @ApiOperation({ summary: "Get a student's wallet by studentId, if provisioned" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async findByStudent(@Param("studentId") studentId: string): Promise<WalletResponseDto | null> {
    const wallet = await this.walletsService.findByStudentId(studentId);
    return wallet ? toView(wallet) : null;
  }

  @Get(":id")
  @RequirePermission("wallet:wallet:view")
  @ApiOperation({ summary: "Get a wallet by id" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async findOne(@Param("id") id: string): Promise<WalletResponseDto> {
    return toView(await this.walletsService.findByIdOrFail(id));
  }

  @Post(":id/status")
  @RequirePermission("wallet:wallet:manage")
  @ApiOperation({ summary: "Set wallet status (ACTIVE/LOCKED/FROZEN) — BR-WALL-03. Use POST :id/close to reach CLOSED." })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async setStatus(
    @Param("id") id: string,
    @Body() dto: SetWalletStatusDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletResponseDto> {
    const actorId = requireUserId(req, "setStatus");
    const wallet = await this.walletsService.setStatus(id, dto.status as WallWalletEntity["status"], dto.reason ?? null, actorId);
    return toView(wallet);
  }

  @Post(":id/limits")
  @RequirePermission("wallet:wallet:manage")
  @ApiOperation({ summary: "Update a wallet's daily/txn limits and category blocks — BR-WALL-04 (may only tighten Settings' school-policy maxima)" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async updateLimits(
    @Param("id") id: string,
    @Body() dto: UpdateWalletLimitsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletResponseDto> {
    const actorId = requireUserId(req, "updateLimits");
    const wallet = await this.walletsService.updateLimits(
      id,
      {
        dailyLimit: dto.dailyLimit === undefined ? undefined : dto.dailyLimit === null ? null : Money.fromDecimalString(dto.dailyLimit),
        txnLimit: dto.txnLimit === undefined ? undefined : dto.txnLimit === null ? null : Money.fromDecimalString(dto.txnLimit),
        categoryBlocks: dto.categoryBlocks as WallWalletEntity["categoryBlocks"] | undefined,
      },
      actorId,
    );
    return toView(wallet);
  }
}
