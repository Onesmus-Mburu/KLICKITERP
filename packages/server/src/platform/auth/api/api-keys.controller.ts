import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ApiKeyService } from "../application/api-key.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { AuthenticatedRequest } from "./request-context";

/** FR-API-003 — machine-consumer API key lifecycle. */
@ApiTags("auth")
@Controller("auth/api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @RequirePermission("auth:api-key:manage")
  @ApiOperation({ summary: "Create an API key — secret is returned once, only the hash is stored" })
  @ApiResponse({ status: 201 })
  async create(@Body() dto: CreateApiKeyDto, @Req() req: AuthenticatedRequest) {
    return this.apiKeyService.create(
      requireUserId(req),
      dto.name,
      dto.scopes,
      dto.expiresAt ? new Date(dto.expiresAt) : null,
      dto.ipAllowlist ?? null,
    );
  }

  @Get()
  @RequirePermission("auth:api-key:view")
  @ApiOperation({ summary: "List the caller's API keys (no secrets/hashes returned)" })
  async list(@Req() req: AuthenticatedRequest) {
    return this.apiKeyService.list(requireUserId(req));
  }

  @Delete(":id")
  @RequirePermission("auth:api-key:manage")
  @ApiOperation({ summary: "Revoke an API key — cache-busted immediately (<=1s per §2.4)" })
  async revoke(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.apiKeyService.revoke(id, requireUserId(req));
    return { revoked: true };
  }
}

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sub;
}
