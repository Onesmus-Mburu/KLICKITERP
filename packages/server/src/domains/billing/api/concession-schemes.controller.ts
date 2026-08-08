import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { ConcessionSchemesService } from "../application/concession-schemes.service";
import { BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";
import {
  ConcessionSchemeResponseDto,
  CreateConcessionSchemeDto,
  UpdateConcessionSchemeDto,
} from "./dto/concession-scheme.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillConcessionSchemeEntity): ConcessionSchemeResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    calc: entity.calc,
    value: entity.value.toDecimalString(),
    categoryScope: entity.categoryScope,
    allowsStacking: entity.allowsStacking,
    glAccountId: entity.glAccountId,
    isActive: entity.isActive,
  };
}

@ApiTags("billing-concession-schemes")
@Controller("billing/concession-schemes")
export class ConcessionSchemesController {
  constructor(private readonly service: ConcessionSchemesService) {}

  @Post()
  @RequirePermission("billing:concession-scheme:manage")
  @ApiOperation({ summary: "Create a bill_concession_scheme" })
  @ApiResponse({ status: 201, type: ConcessionSchemeResponseDto })
  async create(@Body() dto: CreateConcessionSchemeDto, @Req() req: AuthenticatedRequest): Promise<ConcessionSchemeResponseDto> {
    return toView(
      await this.service.create(
        {
          name: dto.name,
          kind: dto.kind,
          calc: dto.calc,
          value: Money.fromDecimalString(dto.value),
          categoryScope: dto.categoryScope ?? null,
          allowsStacking: dto.allowsStacking,
          glAccountId: dto.glAccountId,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Get()
  @RequirePermission("billing:concession-scheme:view")
  @ApiOperation({ summary: "List concession schemes" })
  @ApiResponse({ status: 200, type: [ConcessionSchemeResponseDto] })
  async list(): Promise<ConcessionSchemeResponseDto[]> {
    return (await this.service.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:concession-scheme:view")
  @ApiOperation({ summary: "Get a concession scheme by id" })
  @ApiResponse({ status: 200, type: ConcessionSchemeResponseDto })
  async findOne(@Param("id") id: string): Promise<ConcessionSchemeResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:concession-scheme:manage")
  @ApiOperation({ summary: "Update a concession scheme" })
  @ApiResponse({ status: 200, type: ConcessionSchemeResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateConcessionSchemeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConcessionSchemeResponseDto> {
    return toView(
      await this.service.update(
        id,
        {
          name: dto.name,
          kind: dto.kind,
          calc: dto.calc,
          value: dto.value !== undefined ? Money.fromDecimalString(dto.value) : undefined,
          categoryScope: dto.categoryScope,
          allowsStacking: dto.allowsStacking,
          glAccountId: dto.glAccountId,
        },
        req.user?.sub ?? null,
      ),
    );
  }

  @Post(":id/deactivate")
  @RequirePermission("billing:concession-scheme:manage")
  @ApiOperation({ summary: "Deactivate a concession scheme" })
  @ApiResponse({ status: 200, type: ConcessionSchemeResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ConcessionSchemeResponseDto> {
    return toView(await this.service.deactivate(id, req.user?.sub ?? null));
  }

  @Post(":id/activate")
  @RequirePermission("billing:concession-scheme:manage")
  @ApiOperation({ summary: "Reactivate a concession scheme" })
  @ApiResponse({ status: 200, type: ConcessionSchemeResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<ConcessionSchemeResponseDto> {
    return toView(await this.service.activate(id, req.user?.sub ?? null));
  }
}
