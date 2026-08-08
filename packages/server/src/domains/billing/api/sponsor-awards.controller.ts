import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { SponsorAwardsService } from "../application/sponsor-awards.service";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";
import { CreateSponsorAwardDto, SponsorAwardResponseDto, UpdateSponsorAwardDto } from "./dto/sponsor-award.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillSponsorAwardEntity): SponsorAwardResponseDto {
  return {
    id: entity.id,
    sponsorId: entity.sponsorId,
    studentId: entity.studentId,
    termId: entity.termId,
    amount: entity.amount.toDecimalString(),
    categoryScope: entity.categoryScope,
    appliedAmount: entity.appliedAmount.toDecimalString(),
  };
}

@ApiTags("billing-sponsor-awards")
@Controller("billing/sponsor-awards")
export class SponsorAwardsController {
  constructor(private readonly service: SponsorAwardsService) {}

  @Post()
  @RequirePermission("billing:sponsor-award:manage")
  @ApiOperation({ summary: "Create a bill_sponsor_award (FR-BILL-042.1)" })
  @ApiResponse({ status: 201, type: SponsorAwardResponseDto })
  async create(@Body() dto: CreateSponsorAwardDto, @Req() req: AuthenticatedRequest): Promise<SponsorAwardResponseDto> {
    return toView(
      await this.service.create(
        {
          sponsorId: dto.sponsorId,
          studentId: dto.studentId,
          termId: dto.termId,
          amount: Money.fromDecimalString(dto.amount),
          categoryScope: dto.categoryScope ?? null,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:sponsor-award:view")
  @ApiOperation({ summary: "List sponsor awards for a student" })
  @ApiResponse({ status: 200, type: [SponsorAwardResponseDto] })
  async list(@Query("studentId") studentId: string): Promise<SponsorAwardResponseDto[]> {
    return (await this.service.listByStudent(studentId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:sponsor-award:view")
  @ApiOperation({ summary: "Get a sponsor award by id" })
  @ApiResponse({ status: 200, type: SponsorAwardResponseDto })
  async findOne(@Param("id") id: string): Promise<SponsorAwardResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:sponsor-award:manage")
  @ApiOperation({ summary: "Update a sponsor award's still-unapplied amount/scope" })
  @ApiResponse({ status: 200, type: SponsorAwardResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateSponsorAwardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SponsorAwardResponseDto> {
    return toView(
      await this.service.update(
        id,
        {
          amount: dto.amount !== undefined ? Money.fromDecimalString(dto.amount) : undefined,
          categoryScope: dto.categoryScope,
        },
        req.user?.sub ?? null,
      ),
    );
  }
}
