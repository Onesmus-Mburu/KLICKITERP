import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { OpsHealthService } from "../application/ops-health.service";
import { OpsHealthResponseDto } from "./dto/ops-health.dto";

/** `GET /ops/health` (FR-BKP-005.1's `/ops` page data). Route prefix `ops` — disjoint from `backups` (this module's other controller) and every other module's own prefix, no collision. */
@ApiTags("ops")
@Controller("ops")
export class OpsController {
  constructor(private readonly opsHealthService: OpsHealthService) {}

  @Get("health")
  @RequirePermission("ops:health:view")
  @ApiOperation({
    summary:
      "Service healthchecks (DB/Redis/MinIO), disk %, DB size, last-backup badge, app version + license state (stub), log-level, queue depths (N/A — no queue infra exists yet)",
  })
  @ApiResponse({ status: 200, type: OpsHealthResponseDto })
  async health(): Promise<OpsHealthResponseDto> {
    return this.opsHealthService.getHealthSummary();
  }
}
