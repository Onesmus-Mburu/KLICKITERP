import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { ServicePointsService } from "../application/service-points.service";
import { WallServicePointEntity } from "../domain/wall-service-point.entity";
import { WallServicePointOperatorEntity } from "../domain/wall-service-point-operator.entity";
import {
  AssignOperatorDto,
  CreateServicePointDto,
  ServicePointOperatorResponseDto,
  ServicePointResponseDto,
  UpdateServicePointDto,
} from "./dto/service-point.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: WallServicePointEntity): ServicePointResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    glIncomeAccountId: entity.glIncomeAccountId,
    isActive: entity.isActive,
    perTxnLimit: entity.perTxnLimit ? entity.perTxnLimit.toDecimalString() : null,
  };
}

function toOperatorView(entity: WallServicePointOperatorEntity): ServicePointOperatorResponseDto {
  return { id: entity.id, servicePointId: entity.servicePointId, userId: entity.userId };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ServicePointsController.${action}: no authenticated user on request`);
  return userId;
}

/** CRUD for `wall_service_point` + operator assign/unassign. A single `wallet:service-point:manage` code covers both read and write, mirroring `payments:cheque:manage`/`payments:suspense:manage`'s precedent. */
@ApiTags("wallet-service-points")
@Controller("wallet-service-points")
export class ServicePointsController {
  constructor(private readonly servicePointsService: ServicePointsService) {}

  @Post()
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "Create a service point (P-14 spend target)" })
  @ApiResponse({ status: 201, type: ServicePointResponseDto })
  async create(@Body() dto: CreateServicePointDto, @Req() req: AuthenticatedRequest): Promise<ServicePointResponseDto> {
    const actorId = requireUserId(req, "create");
    const created = await this.servicePointsService.create(
      {
        name: dto.name,
        type: dto.type as WallServicePointEntity["type"],
        glIncomeAccountId: dto.glIncomeAccountId,
        perTxnLimit: dto.perTxnLimit ? Money.fromDecimalString(dto.perTxnLimit) : null,
      },
      actorId,
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "List every service point" })
  @ApiResponse({ status: 200, type: [ServicePointResponseDto] })
  async list(): Promise<ServicePointResponseDto[]> {
    return (await this.servicePointsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "Get a service point by id" })
  @ApiResponse({ status: 200, type: ServicePointResponseDto })
  async findOne(@Param("id") id: string): Promise<ServicePointResponseDto> {
    return toView(await this.servicePointsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "Update a service point's name/per_txn_limit/is_active" })
  @ApiResponse({ status: 200, type: ServicePointResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateServicePointDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ServicePointResponseDto> {
    const actorId = requireUserId(req, "update");
    const updated = await this.servicePointsService.update(
      id,
      { name: dto.name, perTxnLimit: dto.perTxnLimit === undefined ? undefined : Money.fromDecimalString(dto.perTxnLimit), isActive: dto.isActive },
      actorId,
    );
    return toView(updated);
  }

  @Post(":id/operators")
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "Assign a usr_user as an operator of this service point" })
  @ApiResponse({ status: 201, type: ServicePointOperatorResponseDto })
  async assignOperator(
    @Param("id") id: string,
    @Body() dto: AssignOperatorDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ServicePointOperatorResponseDto> {
    const actorId = requireUserId(req, "assignOperator");
    return toOperatorView(await this.servicePointsService.assignOperator(id, dto.userId, actorId));
  }

  @Delete(":id/operators/:userId")
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "Unassign a usr_user as an operator of this service point" })
  @ApiResponse({ status: 200 })
  async unassignOperator(@Param("id") id: string, @Param("userId") userId: string): Promise<{ ok: true }> {
    await this.servicePointsService.unassignOperator(id, userId);
    return { ok: true };
  }

  @Get(":id/operators")
  @RequirePermission("wallet:service-point:manage")
  @ApiOperation({ summary: "List every operator assigned to this service point" })
  @ApiResponse({ status: 200, type: [ServicePointOperatorResponseDto] })
  async listOperators(@Param("id") id: string): Promise<ServicePointOperatorResponseDto[]> {
    return (await this.servicePointsService.listOperators(id)).map(toOperatorView);
  }
}
