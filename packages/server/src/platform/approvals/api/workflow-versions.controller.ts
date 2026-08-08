import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { LevelsService } from "../application/levels.service";
import { RoutingRulesService } from "../application/routing-rules.service";
import { WorkflowVersionsService } from "../application/workflow-versions.service";
import { ApprLevelEntity } from "../domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";
import { ApprWorkflowVersionEntity } from "../domain/appr-workflow-version.entity";
import { LevelResponseDto } from "./dto/level-response.dto";
import { PublishWorkflowVersionDto } from "./dto/publish-workflow-version.dto";
import { RoutingRuleInputDto } from "./dto/routing-rule-input.dto";
import { RoutingRuleResponseDto } from "./dto/routing-rule-response.dto";
import { UpdateLevelDto } from "./dto/update-level.dto";
import { UpdateRoutingRuleDto } from "./dto/update-routing-rule.dto";
import { WorkflowVersionResponseDto } from "./dto/workflow-version-response.dto";
import { AuthenticatedRequest } from "./request-context";

function toVersionView(entity: ApprWorkflowVersionEntity): WorkflowVersionResponseDto {
  return entity;
}

function toLevelView(entity: ApprLevelEntity): LevelResponseDto {
  return entity;
}

function toRoutingRuleView(entity: ApprRoutingRuleEntity): RoutingRuleResponseDto {
  return {
    ...entity,
    minAmount: entity.minAmount.toDecimalString(),
    maxAmount: entity.maxAmount ? entity.maxAmount.toDecimalString() : null,
  } as unknown as RoutingRuleResponseDto;
}

/**
 * `appr_workflow_version` + its nested `appr_level`/`appr_routing_rule` rows
 * — `LevelsService`/`RoutingRulesService` are folded into this one
 * controller (task anatomy names 4 controller files; levels/routing rules
 * only ever make sense scoped to a version, so they live here rather than
 * as two more top-level controllers).
 */
@ApiTags("approvals-workflow-versions")
@Controller("approvals")
export class WorkflowVersionsController {
  constructor(
    private readonly workflowVersionsService: WorkflowVersionsService,
    private readonly levelsService: LevelsService,
    private readonly routingRulesService: RoutingRulesService,
  ) {}

  @Post("workflow-definitions/:defId/versions/publish")
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({
    summary: "Create a new version + its levels + its routing rules atomically, and mark it current",
  })
  @ApiResponse({ status: 201, type: WorkflowVersionResponseDto })
  async publish(
    @Param("defId") defId: string,
    @Body() dto: PublishWorkflowVersionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowVersionResponseDto> {
    const created = await this.workflowVersionsService.publishNewVersion(
      defId,
      dto.levels,
      dto.routingRules.map((rule) => toRoutingRuleInput(rule)),
      req.user?.sub ?? null,
    );
    return toVersionView(created);
  }

  @Get("workflow-definitions/:defId/versions")
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "List versions for a workflow definition, newest first" })
  @ApiResponse({ status: 200, type: [WorkflowVersionResponseDto] })
  async listByDef(@Param("defId") defId: string): Promise<WorkflowVersionResponseDto[]> {
    return (await this.workflowVersionsService.listByDef(defId)).map(toVersionView);
  }

  @Get("workflow-versions/:id")
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "Get a workflow version by id" })
  @ApiResponse({ status: 200, type: WorkflowVersionResponseDto })
  async findOne(@Param("id") id: string): Promise<WorkflowVersionResponseDto> {
    return toVersionView(await this.workflowVersionsService.findByIdOrFail(id));
  }

  @Post("workflow-versions/:id/set-current")
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({ summary: "Mark this version current for its workflow_def_id (unsets the previous one)" })
  @ApiResponse({ status: 200, type: WorkflowVersionResponseDto })
  async setCurrent(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowVersionResponseDto> {
    return toVersionView(await this.workflowVersionsService.setCurrent(id, req.user?.sub ?? null));
  }

  @Get("workflow-versions/:id/levels")
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "List levels for a workflow version, ascending by seq" })
  @ApiResponse({ status: 200, type: [LevelResponseDto] })
  async listLevels(@Param("id") id: string): Promise<LevelResponseDto[]> {
    return (await this.levelsService.listByVersion(id)).map(toLevelView);
  }

  @Patch("workflow-versions/levels/:levelId")
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({ summary: "Update a single level (e.g. correcting a draft, not-yet-current version)" })
  @ApiResponse({ status: 200, type: LevelResponseDto })
  async updateLevel(
    @Param("levelId") levelId: string,
    @Body() dto: UpdateLevelDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LevelResponseDto> {
    return toLevelView(await this.levelsService.update(levelId, dto, req.user?.sub ?? null));
  }

  @Get("workflow-versions/:id/routing-rules")
  @RequirePermission("approvals:workflow:view")
  @ApiOperation({ summary: "List routing rules for a workflow version" })
  @ApiResponse({ status: 200, type: [RoutingRuleResponseDto] })
  async listRoutingRules(@Param("id") id: string): Promise<RoutingRuleResponseDto[]> {
    return (await this.routingRulesService.listByVersion(id)).map(toRoutingRuleView);
  }

  @Patch("workflow-versions/routing-rules/:ruleId")
  @RequirePermission("approvals:workflow:manage")
  @ApiOperation({ summary: "Update a single routing rule" })
  @ApiResponse({ status: 200, type: RoutingRuleResponseDto })
  async updateRoutingRule(
    @Param("ruleId") ruleId: string,
    @Body() dto: UpdateRoutingRuleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoutingRuleResponseDto> {
    const updated = await this.routingRulesService.update(
      ruleId,
      {
        minAmount: dto.minAmount !== undefined ? Money.fromDecimalString(dto.minAmount) : undefined,
        maxAmount: dto.maxAmount !== undefined ? (dto.maxAmount === null ? null : Money.fromDecimalString(dto.maxAmount)) : undefined,
        levelSubset: dto.levelSubset,
        departmentId: dto.departmentId,
      },
      req.user?.sub ?? null,
    );
    return toRoutingRuleView(updated);
  }
}

function toRoutingRuleInput(dto: RoutingRuleInputDto): {
  minAmount: Money;
  maxAmount: Money | null;
  levelSubset: number[] | null;
  departmentId: string | null;
} {
  return {
    minAmount: Money.fromDecimalString(dto.minAmount),
    maxAmount: dto.maxAmount ? Money.fromDecimalString(dto.maxAmount) : null,
    levelSubset: dto.levelSubset ?? null,
    departmentId: dto.departmentId ?? null,
  };
}
