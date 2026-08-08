import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { SalaryStructuresService, StructureComponentFormula } from "../application/salary-structures.service";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";
import {
  CreatePyrlSalaryStructureDto,
  PyrlSalaryStructureResponseDto,
  StructureComponentLineDto,
  StructureComponentLineResponseDto,
  UpdatePyrlSalaryStructureDto,
} from "./dto/salary-structure.dto";

function toView(entity: PyrlSalaryStructureEntity): PyrlSalaryStructureResponseDto {
  return { id: entity.id, name: entity.name, grade: entity.grade, effectiveFrom: entity.effectiveFrom };
}

function toLineView(entity: PyrlStructureComponentEntity): StructureComponentLineResponseDto {
  return {
    id: entity.id,
    structureId: entity.structureId,
    componentId: entity.componentId,
    amount: entity.amount ? entity.amount.toDecimalString() : null,
    formula: entity.formula,
  };
}

function toFormula(dto: StructureComponentLineDto): StructureComponentFormula {
  if (dto.type === "FIXED") {
    if (!dto.amount) throw new Error("StructureComponentLineDto: amount is required when type=FIXED");
    return { type: "FIXED", amount: dto.amount };
  }
  if (!dto.rate) throw new Error("StructureComponentLineDto: rate is required when type=PERCENT_OF_BASIC");
  return { type: "PERCENT_OF_BASIC", rate: dto.rate };
}

/** `pyrl_salary_structure` + `pyrl_structure_component` CRUD. Single `payroll:structure:manage` code covers both the structure header and its lines (task brief's own list has no separate line-level code). */
@ApiTags("payroll-salary-structures")
@Controller("payroll/salary-structures")
export class SalaryStructuresController {
  constructor(private readonly salaryStructuresService: SalaryStructuresService) {}

  @Post()
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Create a pyrl_salary_structure" })
  @ApiResponse({ status: 201, type: PyrlSalaryStructureResponseDto })
  async create(@Body() dto: CreatePyrlSalaryStructureDto): Promise<PyrlSalaryStructureResponseDto> {
    const created = await this.salaryStructuresService.create(
      { name: dto.name, grade: dto.grade ?? null, effectiveFrom: dto.effectiveFrom },
      null,
    );
    return toView(created);
  }

  @Patch(":id")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Update a pyrl_salary_structure" })
  @ApiResponse({ status: 200, type: PyrlSalaryStructureResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdatePyrlSalaryStructureDto): Promise<PyrlSalaryStructureResponseDto> {
    const updated = await this.salaryStructuresService.update(id, dto, null);
    return toView(updated);
  }

  @Get()
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "List salary structures" })
  @ApiResponse({ status: 200, type: [PyrlSalaryStructureResponseDto] })
  async list(): Promise<PyrlSalaryStructureResponseDto[]> {
    return (await this.salaryStructuresService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Get a pyrl_salary_structure by id" })
  @ApiResponse({ status: 200, type: PyrlSalaryStructureResponseDto })
  async findOne(@Param("id") id: string): Promise<PyrlSalaryStructureResponseDto> {
    return toView(await this.salaryStructuresService.get(id));
  }

  @Post(":id/lines")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Add a pyrl_structure_component line (exactly one of amount/rate per type)" })
  @ApiResponse({ status: 201, type: StructureComponentLineResponseDto })
  async addLine(@Param("id") structureId: string, @Body() dto: StructureComponentLineDto): Promise<StructureComponentLineResponseDto> {
    const created = await this.salaryStructuresService.addLine(
      structureId,
      { componentId: dto.componentId, formula: toFormula(dto) },
      null,
    );
    return toLineView(created);
  }

  @Patch("lines/:lineId")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Update a pyrl_structure_component line" })
  @ApiResponse({ status: 200, type: StructureComponentLineResponseDto })
  async updateLine(@Param("lineId") lineId: string, @Body() dto: StructureComponentLineDto): Promise<StructureComponentLineResponseDto> {
    const updated = await this.salaryStructuresService.updateLine(lineId, { formula: toFormula(dto) }, null);
    return toLineView(updated);
  }

  @Delete("lines/:lineId")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "Remove a pyrl_structure_component line" })
  @ApiResponse({ status: 200 })
  async removeLine(@Param("lineId") lineId: string): Promise<{ removed: boolean }> {
    await this.salaryStructuresService.removeLine(lineId);
    return { removed: true };
  }

  @Get(":id/lines")
  @RequirePermission("payroll:structure:manage")
  @ApiOperation({ summary: "List a structure's component lines" })
  @ApiResponse({ status: 200, type: [StructureComponentLineResponseDto] })
  async listLines(@Param("id") structureId: string): Promise<StructureComponentLineResponseDto[]> {
    return (await this.salaryStructuresService.listLines(structureId)).map(toLineView);
  }
}
