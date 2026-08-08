import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { CustomFieldService } from "../application/custom-field.service";
import { SetCustomFieldEntityType } from "../domain/set-custom-field-def.entity";
import { CreateCustomFieldDto } from "./dto/create-custom-field.dto";
import { UpdateCustomFieldDto } from "./dto/update-custom-field.dto";
import { AuthenticatedRequest } from "./request-context";

@ApiTags("custom-fields")
@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly customFieldService: CustomFieldService) {}

  @Post()
  @RequirePermission("settings:custom-field:manage")
  @ApiOperation({ summary: "Define a custom field for STUDENT/SUPPLIER/EMPLOYEE/ASSET" })
  @ApiResponse({ status: 201 })
  async create(@Body() dto: CreateCustomFieldDto, @Req() req: AuthenticatedRequest) {
    return this.customFieldService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  @RequirePermission("settings:custom-field:view")
  @ApiOperation({ summary: "List custom field definitions, optionally scoped to one entity type" })
  async list(@Query("entity") entity?: SetCustomFieldEntityType) {
    return this.customFieldService.list(entity);
  }

  @Get(":id")
  @RequirePermission("settings:custom-field:view")
  @ApiOperation({ summary: "Get a custom field definition by id" })
  async findOne(@Param("id") id: string) {
    return this.customFieldService.findByIdOrFail(id);
  }

  @Patch(":id")
  @RequirePermission("settings:custom-field:manage")
  @ApiOperation({ summary: "Update a custom field definition's label/options/is_required" })
  async update(@Param("id") id: string, @Body() dto: UpdateCustomFieldDto, @Req() req: AuthenticatedRequest) {
    return this.customFieldService.update(id, dto, req.user?.sub ?? null);
  }
}
