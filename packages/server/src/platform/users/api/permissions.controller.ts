import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { PermissionsService } from "../application/permissions.service";
import { UsrPermissionEntity } from "../domain/usr-permission.entity";
import { PermissionResponseDto } from "./dto/permission-response.dto";

function toView(entity: UsrPermissionEntity): PermissionResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    module: entity.module,
    description: entity.description,
    isWrite: entity.isWrite,
  };
}

/**
 * Phase 6 Slice 13 Part 1 — new sibling controller browsing the permission
 * catalogue (FR-USER-001.1). Reuses `users:role:view` rather than minting a
 * new permission code — that code's own catalogue description is already
 * "View roles and their permissions" (`permission-catalogue.ts`).
 */
@ApiTags("permissions")
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission("users:role:view")
  @ApiOperation({ summary: "List the permission catalogue, optionally filtered by module" })
  @ApiQuery({ name: "module", required: false, description: "Filter to one module's codes, e.g. 'users'" })
  @ApiResponse({ status: 200, type: [PermissionResponseDto] })
  async list(@Query("module") module?: string): Promise<PermissionResponseDto[]> {
    return (await this.permissionsService.list(module)).map(toView);
  }
}
