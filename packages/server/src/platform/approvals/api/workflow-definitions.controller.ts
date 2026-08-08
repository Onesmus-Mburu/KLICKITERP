import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { WorkflowDefinitionsService } from "../application/workflow-definitions.service";
import { ApprWorkflowDefEntity } from "../domain/appr-workflow-def.entity";
import { CreateWorkflowDefDto } from "./dto/create-workflow-def.dto";
import { UpdateWorkflowDefDto } from "./dto/update-workflow-def.dto";
import { WorkflowDefResponseDto } from "./dto/workflow-def-response.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: ApprWorkflowDefEntity): WorkflowDefResponseDto {
  return entity;
}

/**
 * `appr_workflow_def` CRUD, keyed by `domain_code` — see
 * `WorkflowDefinitionsService`'s doc comment for the open string namespace.
 */
@ApiTags("approvals-workflow-definitions")
@Controller("approvals/workflow-definitions")
export class WorkflowDefinitionsController {
  constructor(private readonly workflowDefinitionsService: WorkflowDefinitionsService) {}

  @Post()
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({ summary: "Register a new appr_workflow_def for a domain_code" })
  @ApiResponse({ status: 201, type: WorkflowDefResponseDto })
  async create(
    @Body() dto: CreateWorkflowDefDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowDefResponseDto> {
    return toView(await this.workflowDefinitionsService.create(dto, req.user?.sub ?? null));
  }

  @Get()
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "List workflow definitions" })
  @ApiResponse({ status: 200, type: [WorkflowDefResponseDto] })
  async list(): Promise<WorkflowDefResponseDto[]> {
    return (await this.workflowDefinitionsService.list()).map(toView);
  }

  @Get(":id")
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "Get a workflow definition by id" })
  @ApiResponse({ status: 200, type: WorkflowDefResponseDto })
  async findOne(@Param("id") id: string): Promise<WorkflowDefResponseDto> {
    return toView(await this.workflowDefinitionsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({ summary: "Update a workflow definition's name/is_active" })
  @ApiResponse({ status: 200, type: WorkflowDefResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowDefDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowDefResponseDto> {
    return toView(await this.workflowDefinitionsService.update(id, dto, req.user?.sub ?? null));
  }
}
