import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { TriggerBindingsService } from "../application/trigger-bindings.service";
import { CommTriggerBindingEntity } from "../domain/comm-trigger-binding.entity";
import { CreateTriggerBindingDto } from "./dto/create-trigger-binding.dto";
import { TriggerBindingResponseDto } from "./dto/trigger-binding-response.dto";
import { UpdateTriggerBindingDto } from "./dto/update-trigger-binding.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: CommTriggerBindingEntity): TriggerBindingResponseDto {
  return entity;
}

/**
 * CRUD for `comm_trigger_binding`. No dispatcher in this codebase reads
 * these rows automatically yet — see `TriggerBindingsService`'s doc comment.
 */
@ApiTags("comms-trigger-bindings")
@Controller("comms/trigger-bindings")
export class TriggerBindingsController {
  constructor(private readonly triggerBindingsService: TriggerBindingsService) {}

  @Post()
  @RequirePermission("comms:trigger-binding:manage")
  @ApiOperation({ summary: "Create a comm_trigger_binding row (event_code/channel, uq per pair)" })
  @ApiResponse({ status: 201, type: TriggerBindingResponseDto })
  async create(
    @Body() dto: CreateTriggerBindingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TriggerBindingResponseDto> {
    return toView(await this.triggerBindingsService.create(dto, req.user?.sub ?? null));
  }

  @Get()
  @RequirePermission("comms:trigger-binding:view")
  @ApiOperation({ summary: "List trigger bindings" })
  @ApiResponse({ status: 200, type: [TriggerBindingResponseDto] })
  async list(): Promise<TriggerBindingResponseDto[]> {
    return (await this.triggerBindingsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("comms:trigger-binding:view")
  @ApiOperation({ summary: "Get a trigger binding by id" })
  @ApiResponse({ status: 200, type: TriggerBindingResponseDto })
  async findOne(@Param("id") id: string): Promise<TriggerBindingResponseDto> {
    return toView(await this.triggerBindingsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("comms:trigger-binding:manage")
  @ApiOperation({ summary: "Update a trigger binding's is_enabled/audience_rule" })
  @ApiResponse({ status: 200, type: TriggerBindingResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTriggerBindingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TriggerBindingResponseDto> {
    return toView(await this.triggerBindingsService.update(id, dto, req.user?.sub ?? null));
  }
}
