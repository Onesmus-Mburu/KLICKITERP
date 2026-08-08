import { Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { IntegritySweepService } from "../application/integrity-sweep.service";
import { IntegrityRunResponseDto } from "./dto/integrity-run-response.dto";

/**
 * NFR-INT-002 — `POST .../run` triggers an on-demand sweep (real hourly
 * scheduling is a future worker concern, not built here, same "logic
 * exists, scheduler doesn't" pattern as every other module's un-dispatched
 * background job).
 */
@ApiTags("accounting-integrity-sweep")
@Controller("accounting/integrity-sweep")
export class IntegritySweepController {
  constructor(private readonly integritySweepService: IntegritySweepService) {}

  @Post("run")
  @RequirePermission("accounting:integrity-sweep:run")
  @ApiOperation({ summary: "Re-derive gl_period_account_total from SUM(gl_journal_line) and record any mismatches" })
  @ApiResponse({ status: 201, type: IntegrityRunResponseDto })
  async run(): Promise<IntegrityRunResponseDto> {
    return this.integritySweepService.runSweep();
  }

  @Get("runs")
  @RequirePermission("accounting:integrity-sweep:run")
  @ApiOperation({ summary: "List recent integrity sweep runs, newest first" })
  @ApiResponse({ status: 200, type: [IntegrityRunResponseDto] })
  async listRuns(@Query("limit") limit?: string): Promise<IntegrityRunResponseDto[]> {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.integritySweepService.listRecent(Number.isFinite(parsed) ? parsed : undefined);
  }
}
