import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { SponsorsService } from "../application/sponsors.service";
import { BillSponsorEntity } from "../domain/bill-sponsor.entity";
import { CreateSponsorDto, SponsorResponseDto, UpdateSponsorDto } from "./dto/sponsor.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillSponsorEntity): SponsorResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    contacts: entity.contacts,
    agreementFileId: entity.agreementFileId,
    allowsCashConversion: entity.allowsCashConversion,
  };
}

@ApiTags("billing-sponsors")
@Controller("billing/sponsors")
export class SponsorsController {
  constructor(private readonly service: SponsorsService) {}

  @Post()
  @RequirePermission("billing:sponsor:manage")
  @ApiOperation({ summary: "Create a bill_sponsor" })
  @ApiResponse({ status: 201, type: SponsorResponseDto })
  async create(@Body() dto: CreateSponsorDto, @Req() req: AuthenticatedRequest): Promise<SponsorResponseDto> {
    return toView(
      await this.service.create(
        {
          name: dto.name,
          contacts: dto.contacts,
          agreementFileId: dto.agreementFileId ?? null,
          allowsCashConversion: dto.allowsCashConversion,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:sponsor:view")
  @ApiOperation({ summary: "List sponsors" })
  @ApiResponse({ status: 200, type: [SponsorResponseDto] })
  async list(): Promise<SponsorResponseDto[]> {
    return (await this.service.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:sponsor:view")
  @ApiOperation({ summary: "Get a sponsor by id" })
  @ApiResponse({ status: 200, type: SponsorResponseDto })
  async findOne(@Param("id") id: string): Promise<SponsorResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:sponsor:manage")
  @ApiOperation({ summary: "Update a sponsor" })
  @ApiResponse({ status: 200, type: SponsorResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateSponsorDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SponsorResponseDto> {
    return toView(
      await this.service.update(
        id,
        {
          name: dto.name,
          contacts: dto.contacts,
          agreementFileId: dto.agreementFileId,
          allowsCashConversion: dto.allowsCashConversion,
        },
        req.user?.sub ?? null,
      ),
    );
  }
}
