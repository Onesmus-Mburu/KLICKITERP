import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { PromotionService } from "../application/promotion.service";
import { PromoteBatchDto } from "./dto/promote-batch.dto";
import { PromotionBatchResponseDto } from "./dto/promotion-batch-response.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("students-promotion")
@Controller("students/promotion-batches")
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Post()
  @RequirePermission("students:promotion:execute")
  @ApiOperation({ summary: "FR-BILL-005: execute a year-rollover promotion batch (partial per-student failures collected, not aborted)" })
  @ApiResponse({ status: 201, type: PromotionBatchResponseDto })
  async promote(
    @Body() dto: PromoteBatchDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PromotionBatchResponseDto> {
    return this.promotionService.promoteBatch({
      fromYearId: dto.fromYearId,
      toYearId: dto.toYearId,
      promotions: dto.promotions,
      executedBy: req.user?.sub ?? null,
    });
  }

  @Get()
  @RequirePermission("students:promotion:execute")
  @ApiOperation({ summary: "List past promotion batches" })
  @ApiResponse({ status: 200, type: [PromotionBatchResponseDto] })
  async list(): Promise<PromotionBatchResponseDto[]> {
    return this.promotionService.list();
  }

  @Get(":id")
  @RequirePermission("students:promotion:execute")
  @ApiOperation({ summary: "Get a promotion batch by id" })
  @ApiResponse({ status: 200, type: PromotionBatchResponseDto })
  async findOne(@Param("id") id: string): Promise<PromotionBatchResponseDto> {
    return this.promotionService.findByIdOrFail(id);
  }
}
