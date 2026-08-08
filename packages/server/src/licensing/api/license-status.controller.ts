import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { LicenseApiService, LicenseStatusView } from "../application/license-api.service";
import { UpdateNoticesService } from "../application/update-notices.service";
import { ApiCallLogEntity } from "../domain/api-call-log.entity";
import { UpdateNoticeEntity } from "../domain/update-notice.entity";
import { ApiCallLogRepository } from "../infrastructure/api-call-log.repository";

export interface ApiCallLogPage {
  items: ApiCallLogEntity[];
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

/**
 * The STAFF-FACING read-only surface (normal JWT + `@RequirePermission` —
 * goes through the full `Jwt -> License -> Permissions -> Authority`
 * `APP_GUARD` pipeline like every other controller in the app, UNLIKE
 * `license-api.controller.ts`'s JWS mutual-auth). One permission code,
 * `license:status:view`, gates all three routes (same "one code, several
 * read routes" shape `ExportJobsController` already established) — the
 * license state, its own call log, and update notices are all "school-visible"
 * per the docs' repeated wording (FR-LIC-005.1, BR-LIC-04) and don't
 * warrant three separate codes for what is, in every case, a read.
 *
 * Deliberately none of these three routes is `@ExemptFromLicenseGuard()` —
 * FR-LIC-006.1's DEACTIVATED branch names ONLY "System Admin export/backup
 * screens" as what remains reachable, a narrower carve-out than BR-LIC-01's
 * general "never blocks reads" principle; this module's own status page is
 * not one of those two named surfaces, so it is correctly blocked too while
 * DEACTIVATED (see `shared/rbac/license-state.guard.ts`'s own doc comment).
 */
@ApiTags("license-status")
@Controller("license")
@RequirePermission("license:status:view")
export class LicenseStatusController {
  constructor(
    private readonly licenseApiService: LicenseApiService,
    private readonly apiCallLogRepository: ApiCallLogRepository,
    private readonly updateNoticesService: UpdateNoticesService,
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Current license state, plan, and expiry" })
  async status(): Promise<LicenseStatusView> {
    return this.licenseApiService.status();
  }

  @Get("api-log")
  @ApiOperation({ summary: "BR-LIC-04's school-visible /license/v1/* call log, paginated" })
  async apiLog(@Query("page") page?: string, @Query("pageSize") pageSize?: string): Promise<ApiCallLogPage> {
    const limit = pageSize ? Number(pageSize) : DEFAULT_PAGE_SIZE;
    const currentPage = page ? Number(page) : DEFAULT_PAGE;
    const [items, total] = await this.apiCallLogRepository.list({ limit, offset: (currentPage - 1) * limit });
    return { items, total };
  }

  @Get("update-notices")
  @ApiOperation({ summary: "Update notices received from Infoney, with their decision status" })
  async updateNotices(): Promise<UpdateNoticeEntity[]> {
    return this.updateNoticesService.list();
  }
}
