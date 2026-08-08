import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { PaginationQueryDto } from "../../../shared/pagination/pagination.dto";
import { Money } from "../../../shared/money/money";
import { UsersService } from "../application/users.service";
import { RolesService } from "../application/roles.service";
import { UsrUserEntity } from "../domain/usr-user.entity";
import { UsrRoleEntity } from "../domain/usr-role.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { AssignDepartmentDto } from "./dto/assign-department.dto";
import { SetAuthorityLimitDto } from "./dto/set-authority-limit.dto";
import { AssignRoleDto } from "./dto/assign-role.dto";
import { CreateUserResponseDto, UserListResponseDto, UserResponseDto } from "./dto/user-response.dto";
import { AssignRoleResultDto, RoleResponseDto } from "./dto/role-response.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Phase 6 Slice 13 Part 1 — security fix: this `toView()` mapper is what
 * actually stops `UsrUserEntity.passwordHash`/`twofaSecretEnc`/
 * `recoveryCodesEnc` from ever reaching a response body. Before this pass,
 * every handler below returned the raw entity straight from the service
 * layer with no mapping and no `ClassSerializerInterceptor` registered
 * anywhere in `packages/server/src` — confirmed by direct grep. The
 * `@ApiResponse({type})` decorators are Swagger documentation only; they do
 * nothing at runtime without this function applied at every return point.
 */
function toView(entity: UsrUserEntity): UserResponseDto {
  return {
    id: entity.id,
    username: entity.username,
    email: entity.email,
    phone: entity.phone,
    fullName: entity.fullName,
    status: entity.status,
    userType: entity.userType,
    mustChangePassword: entity.mustChangePassword,
    twofaEnabled: entity.twofaEnabled,
    departmentId: entity.departmentId,
    departmentName: entity.department ? entity.department.name : null,
    authorityLimitAmount: entity.authorityLimitAmount ? entity.authorityLimitAmount.toDecimalString() : null,
    lastLoginAt: entity.lastLoginAt ? entity.lastLoginAt.toISOString() : null,
    passwordChangedAt: entity.passwordChangedAt.toISOString(),
    locale: entity.locale,
  };
}

/** Small, local mapper — mirrors `RolesController`'s own `toView()`; not shared across controller files, same convention as this codebase's other `toView()` helpers (e.g. `wallets.controller.ts`). */
function toRoleView(entity: UsrRoleEntity): RoleResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    isSystemTemplate: entity.isSystemTemplate,
    isAuditorClass: entity.isAuditorClass,
  };
}

/** Controllers stay thin: DTO -> service call only (architecture doc §4.2 layering rule). */
@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  @Post()
  @RequirePermission("users:user:create")
  @ApiOperation({ summary: "Create a staff/parent/system user (INVITED status, temp password issued once)" })
  @ApiResponse({ status: 201, type: CreateUserResponseDto })
  async create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest): Promise<CreateUserResponseDto> {
    const { user, temporaryPassword } = await this.usersService.create(dto, req.user?.sub ?? null);
    return { user: toView(user), temporaryPassword };
  }

  @Get()
  @RequirePermission("users:user:view")
  @ApiOperation({ summary: "List users" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String, description: "ILIKE substring match against username/fullName/email/phone" })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  async list(
    @Query() pagination: PaginationQueryDto,
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: string,
    @Query("q") q?: string,
  ): Promise<UserListResponseDto> {
    const { items, total } = await this.usersService.list({
      departmentId,
      status,
      q,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    return { items: items.map(toView), total };
  }

  @Get(":id")
  @RequirePermission("users:user:view")
  @ApiOperation({ summary: "Get a user by id" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(@Param("id") id: string): Promise<UserResponseDto> {
    return toView(await this.usersService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("users:user:update")
  @ApiOperation({ summary: "Update a user's profile fields" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto, @Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return toView(await this.usersService.updateProfile(id, dto, req.user?.sub ?? null));
  }

  @Patch(":id/suspend")
  @RequirePermission("users:user:suspend")
  @ApiOperation({ summary: "Suspend a user (state-machine enforced: ACTIVE -> SUSPENDED)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async suspend(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return toView(await this.usersService.changeStatus(id, "SUSPENDED", req.user?.sub ?? null));
  }

  @Patch(":id/reactivate")
  @RequirePermission("users:user:reactivate")
  @ApiOperation({ summary: "Reactivate a user (state-machine enforced: INVITED/SUSPENDED -> ACTIVE)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async reactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return toView(await this.usersService.changeStatus(id, "ACTIVE", req.user?.sub ?? null));
  }

  @Patch(":id/deactivate")
  @RequirePermission("users:user:deactivate")
  @ApiOperation({ summary: "Permanently deactivate a user (state-machine enforced, terminal)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return toView(await this.usersService.changeStatus(id, "DEACTIVATED", req.user?.sub ?? null));
  }

  @Patch(":id/department")
  @RequirePermission("users:user:assign-department")
  @ApiOperation({ summary: "Assign or clear a user's department" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async assignDepartment(
    @Param("id") id: string,
    @Body() dto: AssignDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return toView(await this.usersService.assignDepartment(id, dto.departmentId ?? null, req.user?.sub ?? null));
  }

  @Patch(":id/authority-limit")
  @RequirePermission("users:user:set-authority-limit")
  @ApiOperation({ summary: "Set or clear a user's monetary authority limit (FR-USER-005.1)" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async setAuthorityLimit(
    @Param("id") id: string,
    @Body() dto: SetAuthorityLimitDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    const amount = dto.amount == null ? null : Money.fromDecimalString(dto.amount);
    return toView(await this.usersService.setAuthorityLimit(id, amount, req.user?.sub ?? null));
  }

  @Post(":id/roles")
  @RequirePermission("users:role:assign")
  @ApiOperation({ summary: "Assign a role to a user (SoD-checked, FR-USER-009.1)" })
  @ApiResponse({ status: 201, type: AssignRoleResultDto })
  async assignRole(@Param("id") id: string, @Body() dto: AssignRoleDto): Promise<AssignRoleResultDto> {
    await this.rolesService.assignRoleToUser(id, dto.roleId);
    return { userId: id, roleId: dto.roleId, assigned: true };
  }

  @Get(":id/roles")
  @RequirePermission("users:role:view")
  @ApiOperation({ summary: "List the roles currently assigned to a user" })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  async listRoles(@Param("id") id: string): Promise<RoleResponseDto[]> {
    return (await this.rolesService.listRolesForUser(id)).map(toRoleView);
  }

  @Delete(":id/roles/:roleId")
  @RequirePermission("users:role:assign")
  @HttpCode(204)
  @ApiOperation({ summary: "Unassign a role from a user" })
  @ApiResponse({ status: 204 })
  async unassignRole(@Param("id") id: string, @Param("roleId") roleId: string): Promise<void> {
    await this.rolesService.unassignRoleFromUser(id, roleId);
  }
}
