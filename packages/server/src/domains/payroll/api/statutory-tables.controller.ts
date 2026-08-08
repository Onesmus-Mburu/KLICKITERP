import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { StatutoryTablesService } from "../application/statutory-tables.service";
import { PyrlStatutoryKind, PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";
import { CreatePyrlStatutoryTableDto, PyrlStatutoryTableResponseDto, UpdatePyrlStatutoryTableDto } from "./dto/statutory-table.dto";

function toView(entity: PyrlStatutoryTableEntity): PyrlStatutoryTableResponseDto {
  return {
    id: entity.id,
    kind: entity.kind,
    effectiveFrom: entity.effectiveFrom,
    params: entity.params,
    sourceNote: entity.sourceNote,
  };
}

/** `pyrl_statutory_table` CRUD (FR-PYRL-003: admin-editable rate/band tables, never hardcoded). */
@ApiTags("payroll-statutory-tables")
@Controller("payroll/statutory-tables")
export class StatutoryTablesController {
  constructor(private readonly statutoryTablesService: StatutoryTablesService) {}

  @Post()
  @RequirePermission("payroll:statutory-table:manage")
  @ApiOperation({ summary: "Create a new effective-dated pyrl_statutory_table row (FR-PYRL-003)" })
  @ApiResponse({ status: 201, type: PyrlStatutoryTableResponseDto })
  async create(@Body() dto: CreatePyrlStatutoryTableDto): Promise<PyrlStatutoryTableResponseDto> {
    const created = await this.statutoryTablesService.create(dto, null);
    return toView(created);
  }

  @Patch(":id")
  @RequirePermission("payroll:statutory-table:manage")
  @ApiOperation({ summary: "Update a pyrl_statutory_table row's params/source_note" })
  @ApiResponse({ status: 200, type: PyrlStatutoryTableResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdatePyrlStatutoryTableDto): Promise<PyrlStatutoryTableResponseDto> {
    const updated = await this.statutoryTablesService.update(id, dto, null);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:statutory-table:manage")
  @ApiOperation({ summary: "List all rate-table rows for a given kind, most recent effective_from first" })
  @ApiResponse({ status: 200, type: [PyrlStatutoryTableResponseDto] })
  async listByKind(@Query("kind") kind: PyrlStatutoryKind): Promise<PyrlStatutoryTableResponseDto[]> {
    return (await this.statutoryTablesService.listByKind(kind)).map(toView);
  }

  // NOTE: registered BEFORE the ":id" route below — Nest matches routes for
  // the same HTTP method in registration order, so a static sub-path like
  // "effective" must precede ":id" or it would be swallowed as id="effective".
  @Get("effective")
  @RequirePermission("payroll:statutory-table:manage")
  @ApiOperation({ summary: "BR-PYRL-01 lookup — the rate table effective on or before a given period-end date" })
  @ApiResponse({ status: 200, type: PyrlStatutoryTableResponseDto })
  async findEffectiveFor(
    @Query("kind") kind: PyrlStatutoryKind,
    @Query("periodEndDate") periodEndDate: string,
  ): Promise<PyrlStatutoryTableResponseDto> {
    return toView(await this.statutoryTablesService.findEffectiveFor(kind, periodEndDate));
  }

  @Get(":id")
  @RequirePermission("payroll:statutory-table:manage")
  @ApiOperation({ summary: "Get a pyrl_statutory_table row by id" })
  @ApiResponse({ status: 200, type: PyrlStatutoryTableResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlStatutoryTableResponseDto> {
    return toView(await this.statutoryTablesService.get(id));
  }
}
