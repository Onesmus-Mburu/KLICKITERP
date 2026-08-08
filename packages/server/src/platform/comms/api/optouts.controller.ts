import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { OptoutsService } from "../application/optouts.service";
import { CommOptoutEntity } from "../domain/comm-optout.entity";
import { CreateOptoutDto } from "./dto/create-optout.dto";
import { OptoutResponseDto } from "./dto/optout-response.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: CommOptoutEntity): OptoutResponseDto {
  return entity;
}

@ApiTags("comms-optouts")
@Controller("comms/optouts")
export class OptoutsController {
  constructor(private readonly optoutsService: OptoutsService) {}

  @Post()
  @RequirePermission("comms:optout:manage")
  @ApiOperation({ summary: "Create an opt-out row (guardian_id/channel/scope, uq per triple)" })
  @ApiResponse({ status: 201, type: OptoutResponseDto })
  async create(@Body() dto: CreateOptoutDto, @Req() req: AuthenticatedRequest): Promise<OptoutResponseDto> {
    return toView(await this.optoutsService.create(dto, req.user?.sub ?? null));
  }

  @Get()
  @RequirePermission("comms:optout:manage")
  @ApiOperation({ summary: "List opt-out rows for a guardian" })
  @ApiQuery({ name: "guardianId", required: true, type: String })
  @ApiResponse({ status: 200, type: [OptoutResponseDto] })
  async listByGuardian(@Query("guardianId") guardianId: string): Promise<OptoutResponseDto[]> {
    return (await this.optoutsService.listByGuardian(guardianId)).map(toView);
  }

  @Delete(":id")
  @RequirePermission("comms:optout:manage")
  @ApiOperation({ summary: "Delete (undo) an opt-out row" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: true }> {
    await this.optoutsService.delete(id);
    return { deleted: true };
  }
}
