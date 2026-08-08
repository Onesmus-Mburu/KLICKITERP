import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ExemptFromLicenseGuard } from "../../../shared/rbac/exempt-from-license-guard.decorator";
import { BackupOrchestratorService } from "../application/backup-orchestrator.service";
import { RestoreVerificationService } from "../application/restore-verification.service";
import { BkpBackupRunRepository } from "../infrastructure/bkp-backup-run.repository";
import {
  BackupRunResponseDto,
  ListBackupRunsQueryDto,
  ListBackupRunsResponseDto,
  PruneBackupsResponseDto,
  RunBackupDto,
  toBackupRunResponseDto,
  VerifyRestoreDto,
} from "./dto/backup-run.dto";
import { RestoreRunResponseDto, toRestoreRunResponseDto } from "./dto/restore-run.dto";
import { AuthenticatedRequest } from "./request-context";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * `POST /backups/run`, `GET /backups`, `GET /backups/:id`,
 * `POST /backups/:id/verify-restore`, `POST /backups/prune`
 * (docs/phase-2/01-functional-requirements.md FR-BKP-001.1/003.1). Route
 * prefix `backups` — checked against every other controller's own prefix in
 * this codebase (`ops`, `integrations/*`, `reports`, etc. — see Module 18's
 * own wildcard-vs-static collision lesson) — no collision, this module's two
 * controllers (`BackupsController`/`OpsController`) use disjoint
 * single-segment prefixes and neither has a bare `GET /:id`-shaped wildcard
 * that could swallow the other's routes.
 *
 * Class-level `@ExemptFromLicenseGuard()` (Module 21, `shared/rbac/license-state.guard.ts`):
 * BR-LIC-01/FR-LIC-006.1 — license checks never block backups/restores, in
 * any license state — so every route below opts out of `LicenseStateGuard`.
 */
@ApiTags("backups")
@Controller("backups")
@ExemptFromLicenseGuard()
export class BackupsController {
  constructor(
    private readonly orchestrator: BackupOrchestratorService,
    private readonly restoreVerification: RestoreVerificationService,
    private readonly backupRunRepository: BkpBackupRunRepository,
  ) {}

  @Post("run")
  @RequirePermission("backups:run:create")
  @ApiOperation({ summary: "Run a backup now (SCHEDULED/MANUAL/PRE_UPDATE) — real pg_dump + files-bucket mirror + AES-256-GCM encrypt + multi-destination fan-out; always ends OK or FAILED, never stuck RUNNING" })
  @ApiResponse({ status: 201, type: BackupRunResponseDto })
  async run(@Body() dto: RunBackupDto, @Req() req: AuthenticatedRequest): Promise<BackupRunResponseDto> {
    const run = await this.orchestrator.runBackup(dto.kind, req.user?.sub ?? null);
    return toBackupRunResponseDto(run);
  }

  @Get()
  @RequirePermission("backups:run:view")
  @ApiOperation({ summary: "List backup runs (filterable by kind/status), paginated" })
  @ApiResponse({ status: 200, type: ListBackupRunsResponseDto })
  async list(@Query() query: ListBackupRunsQueryDto): Promise<ListBackupRunsResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await this.backupRunRepository.list({
      kind: query.kind,
      status: query.status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      items: items.map(toBackupRunResponseDto),
      meta: { total, page, pageSize, pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
    };
  }

  @Get(":id")
  @RequirePermission("backups:run:view")
  @ApiOperation({ summary: "Get one backup run (including its destinations/manifest)" })
  @ApiResponse({ status: 200, type: BackupRunResponseDto })
  async get(@Param("id") id: string): Promise<BackupRunResponseDto> {
    const run = await this.backupRunRepository.findByIdOrFail(id);
    return toBackupRunResponseDto(run);
  }

  @Post(":id/verify-restore")
  @RequirePermission("backups:restore:verify")
  @ApiOperation({
    summary:
      "FR-BKP-003.1 restore-verify — real pg_restore + row-count-vs-manifest smoke query against an ALREADY-REACHABLE target connection (provisioning the target/scratch-container itself is out of scope, see RestoreVerificationService's own doc comment)",
  })
  @ApiResponse({ status: 201, type: RestoreRunResponseDto })
  async verifyRestore(
    @Param("id") id: string,
    @Body() dto: VerifyRestoreDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestoreRunResponseDto> {
    const result = await this.restoreVerification.verifyBackup(id, dto.target, req.user?.sub ?? null);
    return toRestoreRunResponseDto(result);
  }

  @Post("prune")
  @RequirePermission("backups:retention:prune")
  @ApiOperation({ summary: "Run GFS retention pruning (keep 7 daily / 4 weekly / 12 monthly SCHEDULED runs) — deletes pruned runs' destination files/objects AND their bkp_backup_run rows" })
  @ApiResponse({ status: 200, type: PruneBackupsResponseDto })
  async prune(): Promise<PruneBackupsResponseDto> {
    return this.orchestrator.pruneOldBackups();
  }
}
