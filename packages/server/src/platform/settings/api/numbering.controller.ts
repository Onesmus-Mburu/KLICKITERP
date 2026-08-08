import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { NumberingService } from "../application/numbering.service";

/**
 * READ-ONLY inspection endpoints only. Allocation (`NumberingService.allocate()`)
 * is an internal service call other modules make inside their own
 * transaction — never a public HTTP mutation — so this controller exposes
 * nothing that advances `next_no`.
 */
@ApiTags("numbering")
@Controller("numbering-series")
export class NumberingController {
  constructor(private readonly numberingService: NumberingService) {}

  @Get()
  @RequirePermission("settings:numbering-series:view")
  @ApiOperation({ summary: "List all numbering series" })
  async list() {
    return this.numberingService.list();
  }

  @Get(":id")
  @RequirePermission("settings:numbering-series:view")
  @ApiOperation({ summary: "Get a numbering series by id" })
  async findOne(@Param("id") id: string) {
    return this.numberingService.findByIdOrFail(id);
  }

  @Get(":id/preview")
  @RequirePermission("settings:numbering-series:view")
  @ApiOperation({ summary: "Preview the next N numbers without allocating them (FR-SET-006.1)" })
  async preview(@Param("id") id: string, @Query("count") count?: string) {
    const parsed = count ? Number.parseInt(count, 10) : 3;
    return { series: id, next: await this.numberingService.previewNext(id, Number.isFinite(parsed) ? parsed : 3) };
  }
}
