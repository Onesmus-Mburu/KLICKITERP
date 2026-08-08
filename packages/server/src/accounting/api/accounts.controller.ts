import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { ChartOfAccountsService } from "../application/chart-of-accounts.service";
import { GlAccountClass } from "../domain/gl-account.entity";
import { AccountResponseDto, AccountTreeNodeResponseDto } from "./dto/account-response.dto";
import { CreateAccountDto } from "./dto/create-account.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";
import { AuthenticatedRequest } from "./request-context";

/** `gl_account` CRUD + the hierarchy view. `GET /accounting/accounts/tree` is registered before `:id` so it never gets swallowed by the param route. */
@ApiTags("accounting-accounts")
@Controller("accounting/accounts")
export class AccountsController {
  constructor(private readonly chartOfAccountsService: ChartOfAccountsService) {}

  @Post()
  @RequirePermission("accounting:account:manage")
  @ApiOperation({ summary: "Create a gl_account (chart of accounts entry)" })
  @ApiResponse({ status: 201, type: AccountResponseDto })
  async create(@Body() dto: CreateAccountDto, @Req() req: AuthenticatedRequest): Promise<AccountResponseDto> {
    return this.chartOfAccountsService.create(
      {
        code: dto.code,
        name: dto.name,
        class: dto.class,
        parentId: dto.parentId ?? null,
        isPostable: dto.isPostable,
        isControl: dto.isControl,
        controlDomain: dto.controlDomain ?? null,
        taxTreatment: dto.taxTreatment ?? null,
      },
      req.user?.sub ?? null,
    );
  }

  @Get("tree")
  @RequirePermission("accounting:account:view")
  @ApiOperation({ summary: "Assemble the parent/child chart-of-accounts hierarchy for UI display" })
  @ApiResponse({ status: 200, type: [AccountTreeNodeResponseDto] })
  async tree(): Promise<AccountTreeNodeResponseDto[]> {
    return this.chartOfAccountsService.getTree() as unknown as Promise<AccountTreeNodeResponseDto[]>;
  }

  @Get()
  @RequirePermission("accounting:account:view")
  @ApiOperation({ summary: "List accounts, optionally filtered by class/isActive/parentId" })
  @ApiResponse({ status: 200, type: [AccountResponseDto] })
  async list(
    @Query("class") accountClass?: GlAccountClass,
    @Query("isActive") isActive?: string,
    @Query("parentId") parentId?: string,
  ): Promise<AccountResponseDto[]> {
    return this.chartOfAccountsService.list({
      class: accountClass,
      isActive: isActive === undefined ? undefined : isActive === "true",
      parentId: parentId === undefined ? undefined : parentId === "null" ? null : parentId,
    });
  }

  @Get(":id")
  @RequirePermission("accounting:account:view")
  @ApiOperation({ summary: "Get an account by id" })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  async findOne(@Param("id") id: string): Promise<AccountResponseDto> {
    return this.chartOfAccountsService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("accounting:account:manage")
  @ApiOperation({ summary: "Update an account's mutable fields (code/class/parentId/isPostable are locked post-creation)" })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAccountDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AccountResponseDto> {
    return this.chartOfAccountsService.update(id, dto, req.user?.sub ?? null);
  }

  @Post(":id/deactivate")
  @RequirePermission("accounting:account:manage")
  @ApiOperation({ summary: "Soft-deactivate an account (BR-ACC-01's always-preferred path)" })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<AccountResponseDto> {
    return this.chartOfAccountsService.deactivate(id, req.user?.sub ?? null);
  }

  @Post(":id/activate")
  @RequirePermission("accounting:account:manage")
  @ApiOperation({ summary: "Reactivate a previously deactivated account" })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<AccountResponseDto> {
    return this.chartOfAccountsService.activate(id, req.user?.sub ?? null);
  }

  @Delete(":id")
  @RequirePermission("accounting:account:manage")
  @ApiOperation({ summary: "Hard-delete an account (rejected with 409 if it has postings — use deactivate instead)" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    await this.chartOfAccountsService.remove(id);
    return { deleted: true };
  }
}
