import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ClassesService } from "../application/classes.service";
import { ClassResponseDto } from "./dto/class-response.dto";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("students-classes")
@Controller("students/classes")
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Create a std_class (class ladder rung)" })
  @ApiResponse({ status: 201, type: ClassResponseDto })
  async create(@Body() dto: CreateClassDto, @Req() req: AuthenticatedRequest): Promise<ClassResponseDto> {
    return this.classesService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "List classes" })
  @ApiResponse({ status: 200, type: [ClassResponseDto] })
  async list(): Promise<ClassResponseDto[]> {
    return this.classesService.list();
  }

  @Get(":id")
  @RequirePermission("students:class:view")
  @ApiOperation({ summary: "Get a class by id" })
  @ApiResponse({ status: 200, type: ClassResponseDto })
  async findOne(@Param("id") id: string): Promise<ClassResponseDto> {
    return this.classesService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Update a class" })
  @ApiResponse({ status: 200, type: ClassResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateClassDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClassResponseDto> {
    return this.classesService.update(id, dto, req.user?.sub ?? null);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("students:class:manage")
  @ApiOperation({ summary: "Delete a class — rejected with 409 if any student or stream still references it" })
  @ApiResponse({ status: 204 })
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.classesService.delete(id, req.user?.sub ?? null);
  }
}
