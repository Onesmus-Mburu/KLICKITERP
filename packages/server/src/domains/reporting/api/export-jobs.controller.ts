import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ExemptFromLicenseGuard } from "../../../shared/rbac/exempt-from-license-guard.decorator";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { runInTransaction } from "../../../shared/database/tx";
import { ExportJobsService } from "../application/export-jobs.service";
import { RptExportJobEntity } from "../domain/rpt-export-job.entity";
import { CreateExportJobDto, ExportJobResponseDto } from "./dto/export-job.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: RptExportJobEntity): ExportJobResponseDto {
  return {
    id: entity.id,
    reportCode: entity.reportCode,
    params: entity.params,
    requestedBy: entity.requestedBy,
    status: entity.status,
    fileId: entity.fileId,
  };
}

/**
 * `POST /reports/export` (create + synchronously run a CSV export, or queue
 * an XLSX/PDF placeholder — see `ExportJobsService`'s own doc comment) and
 * `GET /reports/export/:id`. Both routes are gated by the single
 * `reports:export:create` code (per the task brief's own explicit
 * permission-code list) — a caller who may create an export may also check
 * its status, so `GET` does not need its own separate `:view` code.
 *
 * Class-level `@ExemptFromLicenseGuard()` (Module 21, `shared/rbac/license-state.guard.ts`):
 * BR-LIC-01/FR-LIC-006.1 — license checks never block exports, in any
 * license state — so both routes below opt out of `LicenseStateGuard`.
 */
@ApiTags("reporting-export-jobs")
@Controller("reports/export")
@RequirePermission("reports:export:create")
@ExemptFromLicenseGuard()
export class ExportJobsController {
  constructor(
    private readonly exportJobsService: ExportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create and run an export job (CSV: synchronous, real; XLSX/PDF: queued placeholder — see ExportJobsService)" })
  @ApiResponse({ status: 201, type: ExportJobResponseDto })
  async create(@Body() dto: CreateExportJobDto, @Req() req: AuthenticatedRequest): Promise<ExportJobResponseDto> {
    const requestedBy = req.user?.sub;
    if (!requestedBy) throw new AuthenticationException("Authentication required");

    const job = await runInTransaction(this.dataSource, (manager) =>
      this.exportJobsService.createJob(manager, {
        reportCode: dto.reportCode,
        params: dto.params,
        format: dto.format,
        requestedBy,
      }),
    );
    return toView(job);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an export job's status/result" })
  @ApiResponse({ status: 200, type: ExportJobResponseDto })
  async findOne(@Param("id") id: string): Promise<ExportJobResponseDto> {
    return toView(await this.exportJobsService.findByIdOrFail(id));
  }
}
