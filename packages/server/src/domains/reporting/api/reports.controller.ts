import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { resolveGrantedPermissions } from "../../../platform/auth";
import { ReportParamType, ReportRegistryService } from "../application/report-registry.service";
import { SavedParamsService } from "../application/saved-params.service";
import {
  ExecuteReportDto,
  ReportDefinitionResponseDto,
  ReportResultResponseDto,
} from "./dto/report-catalogue.dto";
import { CreateSavedParamsDto, SavedParamsResponseDto, UpdateSavedParamsDto } from "./dto/saved-params.dto";
import { AuthenticatedRequest } from "./request-context";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Lenient per-report param-shape check — `ReportDefinition.paramsShape` does not encode optionality (see that interface's own doc comment), so a param that is simply ABSENT is not rejected here; only a PRESENT value of the wrong primitive type is. */
function validateParamsShape(paramsShape: Record<string, ReportParamType>, params: Record<string, unknown>): void {
  for (const [key, type] of Object.entries(paramsShape)) {
    const value = params[key];
    if (value === undefined) continue;
    const valid =
      (type === "uuid" && typeof value === "string" && UUID_PATTERN.test(value)) ||
      (type === "date" && typeof value === "string" && DATE_PATTERN.test(value)) ||
      (type === "string" && typeof value === "string") ||
      (type === "number" && typeof value === "number");
    if (!valid) {
      throw new ValidationException(`Report param "${key}" must be a ${type}`);
    }
  }
}

/**
 * `GET /reports` (catalogue), `GET /reports/:code`, `POST /reports/:code/execute`,
 * plus `rpt_saved_params` CRUD sub-routes.
 *
 * **Dynamic per-report permission check on `POST /reports/:code/execute`** —
 * documented at length on `resolveGrantedPermissions()`'s own doc comment
 * (`platform/auth/application/permission-check.util.ts`): a STATIC
 * `@RequirePermission(code)` decorator cannot express "the required
 * permission depends on the `:code` route param" (each report declares its
 * OWN `permissionCode` on its `ReportDefinition`), so this route carries NO
 * `@RequirePermission` at all — the global `PermissionsGuard` therefore
 * no-ops for it (see that guard's own `if (!requiredPermission) return true`
 * branch) — and `execute()` below performs the identical check BY HAND:
 * look up `report.permissionCode` from the registry, resolve the caller's
 * full granted-permission set via `resolveGrantedPermissions()` (the exact
 * same Redis-cache resolution `PermissionsGuard` uses for static routes),
 * and reject with `AuthorizationException` if the code is missing. This is
 * the "dynamic in-handler check" the task brief asked to evaluate — chosen
 * over inventing a second guard/metadata mechanism because
 * `resolveGrantedPermissions()` already centralizes the one piece of
 * genuinely reusable logic (the Redis cache-key format), leaving this
 * handler's own code a thin, readable permission-membership check.
 *
 * `GET /reports`/`GET /reports/:code` carry no permission requirement at
 * all beyond ordinary authentication — they return only CATALOGUE metadata
 * (code/name/columns/paramsShape), never report DATA, so there is nothing
 * sensitive to gate.
 *
 * **`rpt_saved_params` sub-routes are gated by `reports:saved-params:manage`**
 * — a permission code beyond the task brief's own literal list, added
 * because every mutating endpoint in this codebase must be
 * permission-guarded (the established convention every other module's
 * controller follows); `SavedParamsService`'s own owner-scoping (a saved
 * params row belonging to a different user 404s, never 403s — see that
 * service's class doc comment) is an ADDITIONAL layer on top of this
 * permission gate, not a replacement for it.
 */
@ApiTags("reporting-reports")
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly registry: ReportRegistryService,
    private readonly savedParamsService: SavedParamsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the report catalogue, organized by domain" })
  @ApiResponse({ status: 200, type: [ReportDefinitionResponseDto] })
  list(): ReportDefinitionResponseDto[] {
    return this.registry.list().map(toDefinitionView);
  }

  @Get(":code")
  @ApiOperation({ summary: "Get one report's definition (params shape, columns)" })
  @ApiResponse({ status: 200, type: ReportDefinitionResponseDto })
  get(@Param("code") code: string): ReportDefinitionResponseDto {
    return toDefinitionView(this.registry.get(code));
  }

  @Post(":code/execute")
  @ApiOperation({ summary: "Execute a report — gated by that report's OWN permissionCode, checked dynamically (see class doc comment)" })
  @ApiResponse({ status: 200, type: ReportResultResponseDto })
  async execute(
    @Param("code") code: string,
    @Body() dto: ExecuteReportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReportResultResponseDto> {
    const user = req.user;
    if (!user) throw new AuthenticationException("Authentication required");

    const report = this.registry.get(code);
    const granted = await resolveGrantedPermissions(user, this.redis);
    if (!granted.includes(report.permissionCode)) {
      throw new AuthorizationException(`Missing required permission "${report.permissionCode}"`);
    }

    const params = dto.params ?? {};
    validateParamsShape(report.paramsShape, params);

    const result = await report.execute(params, { userId: user.sub, permissions: granted });
    return {
      rows: result.rows,
      totals: result.totals,
      generatedAt: result.generatedAt.toISOString(),
    };
  }

  @Get("saved-params/mine")
  @RequirePermission("reports:saved-params:manage")
  @ApiOperation({ summary: "List the caller's own saved report parameter sets" })
  @ApiResponse({ status: 200, type: [SavedParamsResponseDto] })
  async listSavedParams(@Req() req: AuthenticatedRequest): Promise<SavedParamsResponseDto[]> {
    const userId = requireUserId(req);
    return (await this.savedParamsService.listMine(userId)).map(toSavedParamsView);
  }

  @Post("saved-params")
  @RequirePermission("reports:saved-params:manage")
  @ApiOperation({ summary: "Save a named parameter set for a report" })
  @ApiResponse({ status: 201, type: SavedParamsResponseDto })
  async createSavedParams(
    @Body() dto: CreateSavedParamsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SavedParamsResponseDto> {
    const userId = requireUserId(req);
    const saved = await this.savedParamsService.create({
      userId,
      reportCode: dto.reportCode,
      name: dto.name,
      params: dto.params,
    });
    return toSavedParamsView(saved);
  }

  @Get("saved-params/:id")
  @RequirePermission("reports:saved-params:manage")
  @ApiOperation({ summary: "Get one of the caller's own saved parameter sets" })
  @ApiResponse({ status: 200, type: SavedParamsResponseDto })
  async getSavedParams(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<SavedParamsResponseDto> {
    const userId = requireUserId(req);
    return toSavedParamsView(await this.savedParamsService.get(id, userId));
  }

  @Patch("saved-params/:id")
  @RequirePermission("reports:saved-params:manage")
  @ApiOperation({ summary: "Update one of the caller's own saved parameter sets" })
  @ApiResponse({ status: 200, type: SavedParamsResponseDto })
  async updateSavedParams(
    @Param("id") id: string,
    @Body() dto: UpdateSavedParamsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SavedParamsResponseDto> {
    const userId = requireUserId(req);
    return toSavedParamsView(await this.savedParamsService.update(id, userId, dto));
  }

  @Delete("saved-params/:id")
  @RequirePermission("reports:saved-params:manage")
  @ApiOperation({ summary: "Delete one of the caller's own saved parameter sets" })
  @ApiResponse({ status: 200 })
  async deleteSavedParams(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<{ deleted: true }> {
    const userId = requireUserId(req);
    await this.savedParamsService.delete(id, userId);
    return { deleted: true };
  }
}

function requireUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.sub;
  if (!userId) throw new AuthenticationException("Authentication required");
  return userId;
}

function toDefinitionView(definition: {
  code: string;
  name: string;
  domain: string;
  permissionCode: string;
  paramsShape: Record<string, ReportParamType>;
  columns: { key: string; label: string; type: string }[];
}): ReportDefinitionResponseDto {
  return {
    code: definition.code,
    name: definition.name,
    domain: definition.domain,
    permissionCode: definition.permissionCode,
    paramsShape: definition.paramsShape,
    columns: definition.columns,
  };
}

function toSavedParamsView(entity: {
  id: string;
  userId: string;
  reportCode: string;
  name: string;
  params: Record<string, unknown>;
}): SavedParamsResponseDto {
  return { id: entity.id, userId: entity.userId, reportCode: entity.reportCode, name: entity.name, params: entity.params };
}
