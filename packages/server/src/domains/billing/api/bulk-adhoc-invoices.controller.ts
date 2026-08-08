import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { BulkAdhocInvoicesService } from "../application/bulk-adhoc-invoices.service";
import { BulkGenerateAdhocInvoicesDto, BulkGenerateAdhocInvoicesResultDto } from "./dto/bulk-adhoc-invoice.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Phase 6 Slice 8 — the "bulk Generate Invoice" screen's backend, kept as its
 * OWN controller class (mirrors `BulkBillingController`'s own split from
 * `InvoicesController`, one controller per distinct bulk-operation concern)
 * but registered under the SAME `billing/invoices` route prefix as
 * `InvoicesController` — unlike `BulkBillingController`'s own separate
 * `billing/bulk-billing` prefix — specifically because this endpoint's own
 * designed path is `POST billing/invoices/bulk-generate` (a sibling of
 * `POST billing/invoices/generate`, not a new top-level area). Nest permits
 * multiple controller classes sharing one route prefix as long as their own
 * routes don't collide; `InvoicesController` never declares a
 * `bulk-generate` route, so there's no conflict.
 */
@ApiTags("billing-bulk-adhoc-invoices")
@Controller("billing/invoices")
export class BulkAdhocInvoicesController {
  constructor(private readonly service: BulkAdhocInvoicesService) {}

  @Post("bulk-generate")
  @RequirePermission("billing:bulk-billing:execute")
  @ApiOperation({
    summary:
      "Bulk-generate + post ADHOC invoices for selected students, scoped to selected fee categories — one invoice per due-date group per student",
  })
  @ApiResponse({ status: 201, type: BulkGenerateAdhocInvoicesResultDto })
  async bulkGenerate(
    @Body() dto: BulkGenerateAdhocInvoicesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkGenerateAdhocInvoicesResultDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("BulkAdhocInvoicesController.bulkGenerate: no authenticated user on request");
    return this.service.bulkGenerate(
      { termId: dto.termId, classId: dto.classId, feeCategoryIds: dto.feeCategoryIds, studentIds: dto.studentIds },
      initiatedBy,
    );
  }
}
