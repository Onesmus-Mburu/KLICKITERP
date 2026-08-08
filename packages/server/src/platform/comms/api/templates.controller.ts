import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { TemplatesService } from "../application/templates.service";
import { CommTemplateEntity } from "../domain/comm-template.entity";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { TemplateResponseDto } from "./dto/template-response.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: CommTemplateEntity): TemplateResponseDto {
  return entity;
}

@ApiTags("comms-templates")
@Controller("comms/templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @RequirePermission("comms:template:manage")
  @ApiOperation({ summary: "Create a comm_template row (event_code/channel/locale, uq per triple)" })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async create(@Body() dto: CreateTemplateDto, @Req() req: AuthenticatedRequest): Promise<TemplateResponseDto> {
    return toView(await this.templatesService.create(dto, req.user?.sub ?? null));
  }

  @Get()
  @RequirePermission("comms:template:view")
  @ApiOperation({ summary: "List templates" })
  @ApiResponse({ status: 200, type: [TemplateResponseDto] })
  async list(): Promise<TemplateResponseDto[]> {
    return (await this.templatesService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("comms:template:view")
  @ApiOperation({ summary: "Get a template by id" })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(@Param("id") id: string): Promise<TemplateResponseDto> {
    return toView(await this.templatesService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("comms:template:manage")
  @ApiOperation({ summary: "Update a template's subject/body/variables/is_active" })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    return toView(await this.templatesService.update(id, dto, req.user?.sub ?? null));
  }

  @Delete(":id")
  @RequirePermission("comms:template:manage")
  @ApiOperation({ summary: "Delete a template" })
  @ApiResponse({ status: 200 })
  async remove(@Param("id") id: string): Promise<{ deleted: true }> {
    await this.templatesService.delete(id);
    return { deleted: true };
  }
}
