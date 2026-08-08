import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { BulkBillingService } from "../application/bulk-billing.service";
import { BulkGenerateDto, BulkGenerateResultDto } from "./dto/bulk-billing.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("billing-bulk-billing")
@Controller("billing/bulk-billing")
export class BulkBillingController {
  constructor(private readonly service: BulkBillingService) {}

  @Post("generate")
  @RequirePermission("billing:bulk-billing:execute")
  @ApiOperation({ summary: "Execute a bulk-billing run across a class/stream population (FR-BILL-020.1)" })
  @ApiResponse({ status: 200, type: BulkGenerateResultDto })
  async generate(@Body() dto: BulkGenerateDto, @Req() req: AuthenticatedRequest): Promise<BulkGenerateResultDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("BulkBillingController.generate: no authenticated user on request");
    return this.service.bulkGenerate(dto.termId, { classIds: dto.classIds, streamIds: dto.streamIds }, initiatedBy);
  }
}
