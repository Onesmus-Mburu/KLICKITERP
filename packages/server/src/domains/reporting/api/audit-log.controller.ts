import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AuditLogReport } from "../application/audit-log.report";
import { ReportResultResponseDto } from "./dto/report-catalogue.dto";

/**
 * A DISTINCT, separately-controlled endpoint for `AuditLogReport` rather
 * than folding it into `reports.controller.ts`'s generic `:code/execute`
 * route — per the task brief, audit visibility is sensitive enough (WHO
 * changed WHAT, `before`/`after` diffs) that it deserves its own STATIC
 * `@RequirePermission("reports:audit-log:view")` rather than living behind
 * the generic dynamic-permission `POST /reports/:code/execute` mechanism
 * every OTHER report shares — a real, distinct code path a reviewer can
 * find by grepping for `RequirePermission` alone, without having to reason
 * about the dynamic-check indirection `reports.controller.ts` uses for
 * everything else. `AuditLogReport` REMAINS registered in
 * `ReportRegistryService` too (so it still appears in the catalogue and
 * COULD in principle be executed via the generic route, since its
 * `permissionCode` is checked there identically) — this controller is an
 * additional, more discoverable, purpose-built surface, not a replacement.
 */
@ApiTags("reporting-audit-log")
@Controller("reports/audit-log")
@RequirePermission("reports:audit-log:view")
export class AuditLogController {
  constructor(private readonly auditLogReport: AuditLogReport) {}

  @Get()
  @ApiQuery({ name: "entityType", required: false })
  @ApiQuery({ name: "entityId", required: false })
  @ApiQuery({ name: "actorId", required: false })
  @ApiQuery({ name: "fromDate", required: true })
  @ApiQuery({ name: "toDate", required: true })
  @ApiOperation({ summary: "Query audit.audit_log by entity/actor/date range" })
  @ApiResponse({ status: 200, type: ReportResultResponseDto })
  async search(
    @Query("fromDate") fromDate: string,
    @Query("toDate") toDate: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
  ): Promise<ReportResultResponseDto> {
    const result = await this.auditLogReport.execute({ entityType, entityId, actorId, fromDate, toDate });
    return { rows: result.rows, totals: result.totals, generatedAt: result.generatedAt.toISOString() };
  }
}
