import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ResolvedThemeBundle, ThemesService } from "../application/themes.service";
import { BrndThemeEntity } from "../domain/brnd-theme.entity";
import { CreateThemeDto } from "./dto/create-theme.dto";
import { UpdateThemeDto } from "./dto/update-theme.dto";
import { CurrentThemeResponseDto } from "./dto/current-theme-response.dto";
import { ThemeResponseDto } from "./dto/theme-response.dto";
import { AuthenticatedRequest } from "./request-context";

/** `logoFile`/`faviconFile` are the optional, not-always-loaded relations — never serialize them over HTTP. */
function toView(entity: BrndThemeEntity): ThemeResponseDto {
  const { logoFile: _logoFile, faviconFile: _faviconFile, ...view } = entity;
  return view as unknown as ThemeResponseDto;
}

/**
 * Covers both `/branding/themes` (CRUD + publish/revert/preview, all
 * `@RequirePermission`-guarded) and the public `/branding/theme/current`
 * route (FR-BRND-002.1 — served to the login page before authentication),
 * one service, one controller file per this task's module anatomy. No
 * class-level prefix so each handler declares its own full path, mirroring
 * `AcademicCalendarController`'s two-resource-family pattern.
 */
@ApiTags("branding")
@Controller()
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Post("branding/themes")
  @RequirePermission("branding:theme:manage")
  @ApiOperation({ summary: "Create a theme (starts as DRAFT)" })
  @ApiResponse({ status: 201, type: ThemeResponseDto })
  async create(@Body() dto: CreateThemeDto, @Req() req: AuthenticatedRequest): Promise<ThemeResponseDto> {
    return toView(await this.themesService.create(dto, req.user?.sub ?? null));
  }

  @Get("branding/themes")
  @RequirePermission("branding:theme:view")
  @ApiOperation({ summary: "List themes (all statuses)" })
  @ApiResponse({ status: 200, type: [ThemeResponseDto] })
  async list(): Promise<ThemeResponseDto[]> {
    return (await this.themesService.list()).map(toView);
  }

  @Get("branding/themes/:id")
  @RequirePermission("branding:theme:view")
  @ApiOperation({ summary: "Get a theme by id" })
  @ApiResponse({ status: 200, type: ThemeResponseDto })
  async findOne(@Param("id") id: string): Promise<ThemeResponseDto> {
    return toView(await this.themesService.findByIdOrFail(id));
  }

  @Patch("branding/themes/:id")
  @RequirePermission("branding:theme:manage")
  @ApiOperation({
    summary: "Update a theme's identity/colors/login/documents config",
    description: "Rejected once the theme is PUBLISHED — create a new draft instead of editing a live theme in place.",
  })
  @ApiResponse({ status: 200, type: ThemeResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateThemeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ThemeResponseDto> {
    return toView(await this.themesService.update(id, dto, req.user?.sub ?? null));
  }

  @Get("branding/themes/:id/preview")
  @RequirePermission("branding:theme:view")
  @ApiOperation({
    summary: "Resolve a theme (any status) to its CSS-variable/config bundle for side-by-side preview",
    description: "No side effects — FR-BRND-002.1's Draft -> Preview step.",
  })
  @ApiResponse({ status: 200, type: CurrentThemeResponseDto })
  async preview(@Param("id") id: string): Promise<ResolvedThemeBundle> {
    return this.themesService.preview(id);
  }

  @Post("branding/themes/:id/publish")
  @RequirePermission("branding:theme:publish")
  @ApiOperation({
    summary: "Publish a theme (archives the previously-published theme, atomically)",
    description: "Enforces at most one PUBLISHED theme (uq_brnd_theme_published_p). A no-op if already PUBLISHED.",
  })
  @ApiResponse({ status: 200, type: ThemeResponseDto })
  async publish(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ThemeResponseDto> {
    return toView(await this.themesService.publish(id, req.user?.sub ?? null));
  }

  @Post("branding/themes/:id/revert")
  @RequirePermission("branding:theme:publish")
  @ApiOperation({
    summary: "Revert to a previously ARCHIVED theme (re-publishes it, atomically)",
    description: "Rejects targets that are not currently ARCHIVED.",
  })
  @ApiResponse({ status: 200, type: ThemeResponseDto })
  async revert(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ThemeResponseDto> {
    return toView(await this.themesService.revert(id, req.user?.sub ?? null));
  }

  @Public()
  @Get("branding/theme/current")
  @ApiOperation({
    summary: "Resolved CSS-variable bundle for the currently published theme (public, no auth)",
    description:
      "FR-BRND-002.1: served to the login page before authentication. Falls back to the hardcoded Infoney " +
      "default bundle when no theme has ever been published (pre-seed / boot-time).",
  })
  @ApiResponse({ status: 200, type: CurrentThemeResponseDto })
  async currentTheme(): Promise<ResolvedThemeBundle> {
    return this.themesService.getCurrentTheme();
  }
}
