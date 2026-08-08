import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ComponentsService } from "../application/components.service";
import { PyrlComponentEntity, PyrlComponentKind } from "../domain/pyrl-component.entity";
import { CreatePyrlComponentDto, PyrlComponentResponseDto, UpdatePyrlComponentDto } from "./dto/component.dto";

function toView(entity: PyrlComponentEntity): PyrlComponentResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    kind: entity.kind,
    isTaxable: entity.isTaxable,
    isStatutory: entity.isStatutory,
    glAccountId: entity.glAccountId,
  };
}

/** `pyrl_component` CRUD — the payroll earning/deduction line-type catalogue. No dedicated `:view` code (task brief's own list); `payroll:component:manage` gates every endpoint here, same "reuse the nearest one" judgement call this codebase's other single-code entities make. */
@ApiTags("payroll-components")
@Controller("payroll/components")
export class ComponentsController {
  constructor(private readonly componentsService: ComponentsService) {}

  @Post()
  @RequirePermission("payroll:component:manage")
  @ApiOperation({ summary: "Create a pyrl_component" })
  @ApiResponse({ status: 201, type: PyrlComponentResponseDto })
  async create(@Body() dto: CreatePyrlComponentDto): Promise<PyrlComponentResponseDto> {
    const created = await this.componentsService.create(dto, null);
    return toView(created);
  }

  @Patch(":id")
  @RequirePermission("payroll:component:manage")
  @ApiOperation({ summary: "Update a pyrl_component" })
  @ApiResponse({ status: 200, type: PyrlComponentResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdatePyrlComponentDto): Promise<PyrlComponentResponseDto> {
    const updated = await this.componentsService.update(id, dto, null);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:component:manage")
  @ApiOperation({ summary: "List/filter pyrl_component rows" })
  @ApiResponse({ status: 200, type: [PyrlComponentResponseDto] })
  async list(
    @Query("kind") kind?: PyrlComponentKind,
    @Query("isStatutory") isStatutory?: string,
  ): Promise<PyrlComponentResponseDto[]> {
    const rows = await this.componentsService.list({
      kind,
      isStatutory: isStatutory === undefined ? undefined : isStatutory === "true",
    });
    return rows.map(toView);
  }

  @Get(":id")
  @RequirePermission("payroll:component:manage")
  @ApiOperation({ summary: "Get a pyrl_component by id" })
  @ApiResponse({ status: 200, type: PyrlComponentResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlComponentResponseDto> {
    return toView(await this.componentsService.get(id));
  }
}
