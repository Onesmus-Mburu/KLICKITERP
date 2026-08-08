import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { RolesService } from "../application/roles.service";
import { UsrRoleEntity } from "../domain/usr-role.entity";
import { UsrPermissionEntity } from "../domain/usr-permission.entity";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { AssignPermissionDto } from "./dto/assign-permission.dto";
import { RoleResponseDto } from "./dto/role-response.dto";
import { GrantPermissionResultDto, PermissionResponseDto } from "./dto/permission-response.dto";

function toView(entity: UsrRoleEntity): RoleResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    isSystemTemplate: entity.isSystemTemplate,
    isAuditorClass: entity.isAuditorClass,
  };
}

/** Small, local mapper — mirrors `PermissionsController`'s own `toView()`; not shared across controller files, same convention as this codebase's other `toView()` helpers. */
function toPermissionView(entity: UsrPermissionEntity): PermissionResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    module: entity.module,
    description: entity.description,
    isWrite: entity.isWrite,
  };
}

@ApiTags("roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermission("users:role:create")
  @ApiOperation({ summary: "Create a role" })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return toView(await this.rolesService.create(dto));
  }

  @Get()
  @RequirePermission("users:role:view")
  @ApiOperation({ summary: "List roles" })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  async list(): Promise<RoleResponseDto[]> {
    return (await this.rolesService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("users:role:view")
  @ApiOperation({ summary: "Get a role by id" })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async findOne(@Param("id") id: string): Promise<RoleResponseDto> {
    return toView(await this.rolesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("users:role:update")
  @ApiOperation({ summary: "Update a role's name/description" })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateRoleDto): Promise<RoleResponseDto> {
    return toView(await this.rolesService.update(id, dto));
  }

  @Post(":id/permissions")
  @RequirePermission("users:role:assign-permission")
  @ApiOperation({
    summary: "Grant a permission to a role",
    description: "Rejected if the role is auditor-class and the permission is_write=true (BR-SEC-04), " +
      "or if the resulting permission set violates an enabled SoD pair (FR-USER-009.1).",
  })
  @ApiResponse({ status: 201, type: GrantPermissionResultDto })
  async grantPermission(@Param("id") id: string, @Body() dto: AssignPermissionDto): Promise<GrantPermissionResultDto> {
    await this.rolesService.grantPermission(id, dto.permissionCode);
    return { roleId: id, permissionCode: dto.permissionCode, granted: true };
  }

  @Get(":id/permissions")
  @RequirePermission("users:role:view")
  @ApiOperation({ summary: "List the permissions currently granted to a role" })
  @ApiResponse({ status: 200, type: [PermissionResponseDto] })
  async listPermissions(@Param("id") id: string): Promise<PermissionResponseDto[]> {
    return (await this.rolesService.listPermissionsForRole(id)).map(toPermissionView);
  }

  @Delete(":id/permissions/:code")
  @RequirePermission("users:role:assign-permission")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke a permission from a role" })
  @ApiResponse({ status: 204 })
  async revokePermission(@Param("id") id: string, @Param("code") code: string): Promise<void> {
    await this.rolesService.revokePermission(id, code);
  }
}
