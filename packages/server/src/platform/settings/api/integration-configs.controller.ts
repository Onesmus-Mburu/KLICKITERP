import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { IntegrationConfigService } from "../application/integration-config.service";
import { SetIntegrationConfigEntity, SetIntegrationKind } from "../domain/set-integration-config.entity";
import { CreateIntegrationConfigDto } from "./dto/create-integration-config.dto";
import { UpdateIntegrationConfigDto } from "./dto/update-integration-config.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Never serialize `config_enc` (raw ciphertext bytes) over HTTP — this view
 * shape is what every response uses instead. A plain interface (not
 * `Omit<SetIntegrationConfigEntity, "configEnc">`) because the entity is a
 * class with instance methods (`assignId` from `BaseEntity`) that a
 * destructured plain object can never structurally satisfy.
 */
interface IntegrationConfigView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  kind: SetIntegrationKind;
  name: string;
  isEnabled: boolean;
  priority: number;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
}

function toView(entity: SetIntegrationConfigEntity): IntegrationConfigView {
  const { configEnc: _configEnc, ...view } = entity;
  return view;
}

@ApiTags("integration-configs")
@Controller("integration-configs")
export class IntegrationConfigsController {
  constructor(private readonly integrationConfigService: IntegrationConfigService) {}

  @Post()
  @RequirePermission("settings:integration:manage")
  @ApiOperation({ summary: "Create an integration config (credentials AES-256-GCM encrypted at rest, FR-SET-003.1)" })
  @ApiResponse({ status: 201 })
  async create(@Body() dto: CreateIntegrationConfigDto, @Req() req: AuthenticatedRequest) {
    const created = await this.integrationConfigService.create(dto, req.user?.sub ?? null);
    return toView(created);
  }

  @Get()
  @RequirePermission("settings:integration:view")
  @ApiOperation({ summary: "List integration configs" })
  async list() {
    return (await this.integrationConfigService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("settings:integration:view")
  @ApiOperation({ summary: "Get an integration config by id" })
  async findOne(@Param("id") id: string) {
    return toView(await this.integrationConfigService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("settings:integration:manage")
  @ApiOperation({ summary: "Update an integration config" })
  async update(@Param("id") id: string, @Body() dto: UpdateIntegrationConfigDto, @Req() req: AuthenticatedRequest) {
    const updated = await this.integrationConfigService.update(id, dto, req.user?.sub ?? null);
    return toView(updated);
  }

  @Post(":id/test-connection")
  @RequirePermission("settings:integration:manage")
  @ApiOperation({
    summary: "Test the connection (FR-SET-003.1)",
    description:
      "MPESA (Phase 6 Slice 7) makes a REAL Daraja OAuth token-fetch attempt and reports the genuine result. " +
      "Every other kind still returns { ok: false, message: 'adapter not yet available, config saved' } " +
      "(an intentional stub, not a bug — those adapters aren't wired into this registry yet). " +
      "last_tested_at/last_test_ok are always updated regardless of kind.",
  })
  async testConnection(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.integrationConfigService.testConnection(id, req.user?.sub ?? null);
  }
}
