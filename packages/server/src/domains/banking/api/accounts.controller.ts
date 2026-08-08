import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { BankAccountsService } from "../application/bank-accounts.service";
import { BankAccountEntity, BankAccountKind } from "../domain/bank-account.entity";
import { BankAccountResponseDto, CreateBankAccountDto, UpdateBankAccountDto } from "./dto/account.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankAccountEntity): BankAccountResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    bankName: entity.bankName,
    branch: entity.branch,
    accountNo: entity.accountNo,
    glAccountId: entity.glAccountId,
    isActive: entity.isActive,
  };
}

/** `bank_account` CRUD (BR-BANK-01's 1:1 `gl_account_id` UQ). */
@ApiTags("banking-accounts")
@Controller("banking/accounts")
export class AccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @RequirePermission("banking:account:manage")
  @ApiOperation({ summary: "Create a bank/cash/M-Pesa-settlement/petty account, backed by a gl_account" })
  @ApiResponse({ status: 201, type: BankAccountResponseDto })
  async create(@Body() dto: CreateBankAccountDto, @Req() req: AuthenticatedRequest): Promise<BankAccountResponseDto> {
    const created = await this.bankAccountsService.create(
      {
        name: dto.name,
        kind: dto.kind,
        bankName: dto.bankName ?? null,
        branch: dto.branch ?? null,
        accountNo: dto.accountNo ?? null,
        glAccountId: dto.glAccountId,
      },
      req.user?.sub ?? null,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("banking:account:manage")
  @ApiOperation({ summary: "List bank accounts, optionally filtered by kind/isActive" })
  @ApiResponse({ status: 200, type: [BankAccountResponseDto] })
  async list(
    @Query("kind") kind?: BankAccountKind,
    @Query("isActive") isActive?: string,
  ): Promise<BankAccountResponseDto[]> {
    const rows = await this.bankAccountsService.list({
      kind,
      isActive: isActive === undefined ? undefined : isActive === "true",
    });
    return rows.map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:account:manage")
  @ApiOperation({ summary: "Get a bank account by id" })
  @ApiResponse({ status: 200, type: BankAccountResponseDto })
  async findOne(@Param("id") id: string): Promise<BankAccountResponseDto> {
    return toView(await this.bankAccountsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("banking:account:manage")
  @ApiOperation({ summary: "Update a bank account's config fields" })
  @ApiResponse({ status: 200, type: BankAccountResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateBankAccountDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BankAccountResponseDto> {
    const updated = await this.bankAccountsService.update(id, dto, req.user?.sub ?? null);
    return toView(updated);
  }
}
