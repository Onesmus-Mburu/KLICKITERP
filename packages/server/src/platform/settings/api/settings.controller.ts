import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { SettingsService } from "../application/settings.service";
import { UpsertSettingDto } from "./dto/upsert-setting.dto";
import { AuthenticatedRequest } from "./request-context";

/** Controllers stay thin: DTO -> service call only (architecture doc §4.2 layering rule). */
@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermission("settings:setting:view")
  @ApiOperation({ summary: "List all settings (secret values redacted)" })
  async list() {
    return this.settingsService.list();
  }

  @Get(":key")
  @RequirePermission("settings:setting:view")
  @ApiOperation({ summary: "Get one setting by key (decrypted transparently if is_secret=true)" })
  async findOne(@Param("key") key: string) {
    return { key, value: await this.settingsService.get(key) };
  }

  @Put(":key")
  @RequirePermission("settings:setting:write")
  @ApiOperation({ summary: "Upsert a setting by key (FR-SET-003.1 — AES-256-GCM encrypted at rest when isSecret=true)" })
  @ApiResponse({ status: 200 })
  async upsert(@Param("key") key: string, @Body() dto: UpsertSettingDto, @Req() req: AuthenticatedRequest) {
    const saved = await this.settingsService.set(key, dto.value, dto.isSecret ?? false, req.user?.sub ?? null);
    return { key: saved.key, isSecret: saved.isSecret };
  }
}
