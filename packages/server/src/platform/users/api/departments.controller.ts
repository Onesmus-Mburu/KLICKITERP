import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { DepartmentsService } from "../application/departments.service";
import { UsrDepartmentEntity } from "../domain/usr-department.entity";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { DepartmentResponseDto } from "./dto/department-response.dto";

function toView(entity: UsrDepartmentEntity): DepartmentResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    headUserId: entity.headUserId,
    headUserFullName: entity.headUser ? entity.headUser.fullName : null,
  };
}

@ApiTags("departments")
@Controller("departments")
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @RequirePermission("users:department:create")
  @ApiOperation({ summary: "Create a department" })
  @ApiResponse({ status: 201, type: DepartmentResponseDto })
  async create(@Body() dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    return toView(await this.departmentsService.create(dto));
  }

  @Get()
  @RequirePermission("users:department:view")
  @ApiOperation({ summary: "List departments" })
  @ApiResponse({ status: 200, type: [DepartmentResponseDto] })
  async list(): Promise<DepartmentResponseDto[]> {
    return (await this.departmentsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("users:department:view")
  @ApiOperation({ summary: "Get a department by id" })
  @ApiResponse({ status: 200, type: DepartmentResponseDto })
  async findOne(@Param("id") id: string): Promise<DepartmentResponseDto> {
    return toView(await this.departmentsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("users:department:update")
  @ApiOperation({ summary: "Update a department" })
  @ApiResponse({ status: 200, type: DepartmentResponseDto })
  async update(@Param("id") id: string, @Body() dto: UpdateDepartmentDto): Promise<DepartmentResponseDto> {
    return toView(await this.departmentsService.update(id, dto));
  }
}
