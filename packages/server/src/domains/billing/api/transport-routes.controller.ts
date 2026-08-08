import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { TransportRoutesService } from "../application/transport-routes.service";
import { BillTransportRouteEntity } from "../domain/bill-transport-route.entity";
import { CreateTransportRouteDto, TransportRouteResponseDto, UpdateTransportRouteDto } from "./dto/transport-route.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillTransportRouteEntity): TransportRouteResponseDto {
  return { id: entity.id, name: entity.name, amount: entity.amount.toDecimalString(), isActive: entity.isActive };
}

@ApiTags("billing-transport-routes")
@Controller("billing/transport-routes")
export class TransportRoutesController {
  constructor(private readonly service: TransportRoutesService) {}

  @Post()
  @RequirePermission("billing:transport-route:manage")
  @ApiOperation({ summary: "Create a bill_transport_route" })
  @ApiResponse({ status: 201, type: TransportRouteResponseDto })
  async create(@Body() dto: CreateTransportRouteDto, @Req() req: AuthenticatedRequest): Promise<TransportRouteResponseDto> {
    return toView(
      await this.service.create({ name: dto.name, amount: Money.fromDecimalString(dto.amount) }, req.user?.sub ?? null),
    );
  }

  @Get()
  @RequirePermission("billing:transport-route:view")
  @ApiOperation({ summary: "List transport routes" })
  @ApiResponse({ status: 200, type: [TransportRouteResponseDto] })
  async list(): Promise<TransportRouteResponseDto[]> {
    return (await this.service.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("billing:transport-route:view")
  @ApiOperation({ summary: "Get a transport route by id" })
  @ApiResponse({ status: 200, type: TransportRouteResponseDto })
  async findOne(@Param("id") id: string): Promise<TransportRouteResponseDto> {
    return toView(await this.service.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("billing:transport-route:manage")
  @ApiOperation({ summary: "Update a transport route" })
  @ApiResponse({ status: 200, type: TransportRouteResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTransportRouteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransportRouteResponseDto> {
    return toView(
      await this.service.update(
        id,
        { name: dto.name, amount: dto.amount !== undefined ? Money.fromDecimalString(dto.amount) : undefined },
        req.user?.sub ?? null,
      ),
    );
  }

  @Post(":id/deactivate")
  @RequirePermission("billing:transport-route:manage")
  @ApiOperation({ summary: "Deactivate a transport route" })
  @ApiResponse({ status: 200, type: TransportRouteResponseDto })
  async deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<TransportRouteResponseDto> {
    return toView(await this.service.deactivate(id, req.user?.sub ?? null));
  }

  @Post(":id/activate")
  @RequirePermission("billing:transport-route:manage")
  @ApiOperation({ summary: "Reactivate a transport route" })
  @ApiResponse({ status: 200, type: TransportRouteResponseDto })
  async activate(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<TransportRouteResponseDto> {
    return toView(await this.service.activate(id, req.user?.sub ?? null));
  }
}
